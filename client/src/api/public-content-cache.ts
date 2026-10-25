// Only responses explicitly marked public by the server may enter this cache.
// HTTP requests still run on every visit for permissions, freshness and counters.
const MAX_AGE_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 20;
const MAX_CHARACTERS = 256 * 1024;

interface Entry {
  key: string;
  expiresAt: number;
  data: unknown;
}

interface Snapshot {
  generation: string;
  entries: Entry[];
}

function isEntry(value: unknown): value is Entry {
  return isRecord(value) && typeof value.key === "string" && typeof value.expiresAt === "number";
}

interface RequestTicket {
  key: string;
  sequence: number;
  generation: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isTransientContentError(status: number) {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

export class PublicContentCache {
  private readonly storageKey: string;
  private readonly generationKey: string;
  private snapshot: Snapshot = { generation: "", entries: [] };
  private raw: string | null | undefined;
  private blockedGeneration: string | undefined;
  private sequence = 0;
  private latest = new Map<string, number>();

  constructor(baseUrl: string) {
    // v2 separates the invalidation marker from data written by GET requests.
    // Old clients can keep writing v1 without reviving data in this cache.
    this.storageKey = `rin:public-content:v2:${baseUrl}`;
    this.generationKey = `${this.storageKey}:generation`;
  }

  private read(): Snapshot {
    let generation = "";
    try {
      const stored = localStorage.getItem(this.generationKey);
      if (stored?.length === 36) generation = stored;
    } catch { /* Without a readable shared marker, content cannot be reused. */ }
    if (!generation) {
      this.snapshot = { generation: "", entries: [] };
      this.raw = undefined;
      return this.snapshot;
    }
    if (generation !== this.snapshot.generation) {
      this.snapshot = { generation, entries: [] };
      this.raw = undefined;
    }
    // If neither publishing nor removing a marker was possible, do not reuse
    // data in this client until a later mutation changes that marker.
    if (this.blockedGeneration === generation) return this.snapshot;
    this.blockedGeneration = undefined;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw === this.raw) return this.snapshot;
      this.raw = raw;
      this.snapshot = { generation, entries: [] };
      if (raw && raw.length <= MAX_CHARACTERS) {
        const parsed: unknown = JSON.parse(raw);
        if (isRecord(parsed) && parsed.generation === generation && Array.isArray(parsed.entries)
          && parsed.entries.length <= MAX_ENTRIES && parsed.entries.every(isEntry)) {
          this.snapshot = { generation, entries: parsed.entries };
        }
      }
    } catch {
      // Invalid JSON is a miss. A readable marker still permits memory data
      // when only the payload cannot be read.
    }
    return this.snapshot;
  }

  private write(snapshot: Snapshot) {
    this.snapshot = snapshot;
    try {
      const raw = JSON.stringify(snapshot);
      localStorage.setItem(this.storageKey, raw);
      this.raw = raw;
    } catch {
      // Keep this result in memory, but retain the last observed storage value.
      // Reads still check the shared marker; later writes retry persistence.
    }
  }

  get<T>(key: string, validate: (data: unknown) => data is T): T | undefined {
    const entry = this.read().entries.find((entry) => entry.key === key);
    const now = Date.now();
    if (!entry || entry.expiresAt <= now || entry.expiresAt > now + MAX_AGE_MS || !validate(entry.data)) return;
    return entry.data;
  }

  begin(key: string): RequestTicket {
    let current = this.read();
    if (!current.generation) {
      // Reserve a small, fixed-size marker before permitting memory fallback.
      // Replacing it costs no extra quota; removing it can revoke all readers
      // even if storage later rejects every write. Racing initializers use new
      // UUIDs, so they can cause a miss but cannot revive an earlier generation.
      try { localStorage.setItem(this.generationKey, crypto.randomUUID()); } catch { /* No reusable cache. */ }
      current = this.read();
    }
    const sequence = ++this.sequence;
    this.latest.set(key, sequence);
    return { key, sequence, generation: current.generation };
  }

  finish<T>(ticket: RequestTicket, data: T | undefined, cacheable: boolean, errorStatus?: number) {
    const current = this.read();
    if (this.latest.get(ticket.key) !== ticket.sequence) return;
    this.latest.delete(ticket.key);
    if (!ticket.generation || current.generation !== ticket.generation || this.blockedGeneration === current.generation) return;
    if (errorStatus !== undefined && isTransientContentError(errorStatus)) return;
    if (!cacheable || data === undefined) {
      // Also evict aliases and lists when content is revoked or becomes protected.
      this.clear();
      return;
    }
    const now = Date.now();
    const entry = { key: ticket.key, data, expiresAt: now + MAX_AGE_MS };
    const entries = current.entries.filter((entry) => entry.key !== ticket.key && entry.expiresAt > now);
    if (JSON.stringify(entry).length < MAX_CHARACTERS / 2) entries.push(entry);
    const snapshot = { generation: current.generation, entries: entries.slice(-MAX_ENTRIES) };
    while (snapshot.entries.length && JSON.stringify(snapshot).length > MAX_CHARACTERS) snapshot.entries.shift();
    if (JSON.stringify(snapshot).length > MAX_CHARACTERS) return;
    // This can race with clear() in another tab. It only writes data, never the
    // authoritative marker, so a stale snapshot cannot become readable again.
    this.write(snapshot);
  }

  clear() {
    const previousGeneration = this.read().generation;
    this.latest.clear();
    const generation = crypto.randomUUID();
    let published = false;
    for (let attempt = 0; attempt < 2 && !published; attempt++) {
      try {
        localStorage.setItem(this.generationKey, generation);
        published = true;
      } catch {
        // Free the large payload before retrying the tiny marker under quota.
        try { localStorage.removeItem(this.storageKey); } catch { /* Storage denied. */ }
      }
    }
    if (!published) {
      // Removal requires no additional quota and invalidates other tabs' memory
      // snapshots as well. A later request must reserve an entirely new UUID.
      try { localStorage.removeItem(this.generationKey); } catch { /* Storage denied. */ }
    }
    this.snapshot = { generation: published ? generation : previousGeneration, entries: [] };
    this.blockedGeneration = published ? undefined : previousGeneration;
    this.raw = undefined;
    try { localStorage.removeItem(this.storageKey); } catch { /* Storage denied. */ }
  }
}
