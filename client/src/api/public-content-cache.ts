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
  private snapshot: Snapshot = { generation: "", entries: [] };
  private raw: string | null | undefined;
  private memoryOnly = false;
  private sequence = 0;
  private latest = new Map<string, number>();

  constructor(baseUrl: string) {
    this.storageKey = `rin:public-content:v1:${baseUrl}`;
  }

  private read(): Snapshot {
    if (this.memoryOnly) return this.snapshot;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw === this.raw) return this.snapshot;
      this.raw = raw;
      this.snapshot = { generation: "", entries: [] };
      if (raw && raw.length <= MAX_CHARACTERS) {
        const parsed: unknown = JSON.parse(raw);
        if (isRecord(parsed) && typeof parsed.generation === "string" && Array.isArray(parsed.entries)
          && parsed.entries.length <= MAX_ENTRIES && parsed.entries.every(isEntry)) {
          this.snapshot = { generation: parsed.generation, entries: parsed.entries };
        }
      }
    } catch {
      // Invalid JSON is a miss. Denied storage falls back to this tab's memory.
    }
    return this.snapshot;
  }

  private write(snapshot: Snapshot) {
    this.snapshot = snapshot;
    if (this.memoryOnly) return;
    try {
      this.raw = JSON.stringify(snapshot);
      localStorage.setItem(this.storageKey, this.raw);
    } catch {
      // Remove an older persisted copy if a quota failure prevented invalidation.
      try { localStorage.removeItem(this.storageKey); } catch { /* Storage denied. */ }
      this.memoryOnly = true;
    }
  }

  get<T>(key: string, validate: (data: unknown) => data is T): T | undefined {
    const entry = this.read().entries.find((entry) => entry.key === key);
    const now = Date.now();
    if (!entry || entry.expiresAt <= now || entry.expiresAt > now + MAX_AGE_MS || !validate(entry.data)) return;
    return entry.data;
  }

  begin(key: string): RequestTicket {
    const sequence = ++this.sequence;
    this.latest.set(key, sequence);
    return { key, sequence, generation: this.read().generation };
  }

  finish<T>(ticket: RequestTicket, data: T | undefined, cacheable: boolean, errorStatus?: number) {
    const current = this.read();
    if (this.latest.get(ticket.key) !== ticket.sequence) return;
    this.latest.delete(ticket.key);
    if (current.generation !== ticket.generation) return;
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
    while (JSON.stringify(snapshot).length > MAX_CHARACTERS) snapshot.entries.shift();
    this.write(snapshot);
  }

  clear() {
    this.latest.clear();
    this.write({ generation: crypto.randomUUID(), entries: [] });
  }
}
