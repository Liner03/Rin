import "../../test/setup";
import type { Feed, FeedListResponse } from "@rin/api";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { createClient } from "../client";

const feed: Feed = {
  id: 101, type: "post", title: "Read article", content: "Read article body", slug: "read-article",
  status: "publish", draft: 0, listed: 1, uid: 1, pv: 1, uv: 1, hashtags: [], categories: [],
  ai_summary: "", ai_summary_status: "idle", ai_summary_error: "",
  user: { id: 1, username: "Author", avatar: null },
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};
const list: FeedListResponse = { data: [{ ...feed, summary: "Summary", avatar: null }], size: 1, hasNext: false };
const publicResponse = (data: unknown) => Response.json(data, { headers: { "X-Rin-Content-Cache": "public" } });
const originalFetch = globalThis.fetch;
let api: ReturnType<typeof createClient>;
const pending: (() => void)[] = [];

function respond(response: () => Response) {
  globalThis.fetch = mock(async () => response()) as typeof fetch;
}

function delay() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  globalThis.fetch = mock(() => promise) as typeof fetch;
  pending.push(() => resolve(new Response("Unavailable", { status: 503 })));
  return resolve;
}

beforeEach(() => {
  localStorage.clear();
  api = createClient("https://blog.example");
});
afterEach(() => {
  pending.splice(0).forEach((resolve) => resolve());
  globalThis.fetch = originalFetch;
});

describe("public page-data cache", () => {
  it("survives a new client instance without suppressing the next GET", async () => {
    respond(() => publicResponse(feed));
    await api.feed.get(101);
    const nextTab = createClient("https://blog.example");
    expect(nextTab.feed.getCached(101)?.content).toBe(feed.content);
    await nextTab.feed.get(101);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("separates the API origin, article identifier and list parameters", async () => {
    respond(() => publicResponse(feed));
    await api.feed.get(101);
    expect(createClient("https://other.example").feed.getCached(101)).toBeUndefined();
    expect(api.feed.getCached(102)).toBeUndefined();
    respond(() => publicResponse(list));
    await api.feed.list({ page: 1, limit: 5 });
    expect(api.feed.getCachedList({ page: 1, limit: 5, type: "normal" })?.size).toBe(1);
    expect(api.feed.getCachedList({ page: 2, limit: 5 })).toBeUndefined();
    expect(api.feed.getCachedList({ page: 1, limit: 20 })).toBeUndefined();
    expect(api.feed.getCachedList({ type: "draft" })).toBeUndefined();
  });

  it.each([
    { ...feed, status: "private" }, { ...feed, status: "draft" }, { ...feed, status: "hidden" },
    { ...feed, locked: true }, { ...feed, hasPassword: true, locked: false },
    { ...feed, createdAt: "2999-01-01T00:00:00Z" },
  ])("never persists protected/unpublished content even if mislabelled public: %o", async (data) => {
    respond(() => publicResponse(data));
    await api.feed.get(101);
    expect(api.feed.getCached(101)).toBeUndefined();
    expect(JSON.stringify(localStorage)).not.toContain(feed.content);
  });

  it("requires a server public marker even without a local auth token (cookie sessions)", async () => {
    respond(() => Response.json(feed));
    await api.feed.get(101);
    respond(() => Response.json(list));
    await api.feed.list();
    expect(api.feed.getCached(101)).toBeUndefined();
    expect(api.feed.getCachedList()).toBeUndefined();
  });

  it("expires after five minutes and does not extend lifetime on network errors", async () => {
    const now = Date.now();
    const clock = spyOn(Date, "now").mockReturnValue(now);
    try {
      respond(() => publicResponse(feed));
      await api.feed.get(101);
      clock.mockReturnValue(now + 299_000);
      respond(() => new Response("Unavailable", { status: 503 }));
      await api.feed.get(101);
      expect(api.feed.getCached(101)?.content).toBe(feed.content);
      clock.mockReturnValue(now + 300_001);
      expect(api.feed.getCached(101)).toBeUndefined();
    } finally { clock.mockRestore(); }
  });

  it.each(["update", "delete", "top", "category", "config", "logout"])("invalidates content and lists after %s, including across client instances", async (mutation) => {
    respond(() => publicResponse(feed));
    await api.feed.get(101);
    await api.feed.get("read-article");
    respond(() => publicResponse(list));
    await api.feed.list();
    const nextTab = createClient("https://blog.example");
    expect(nextTab.feed.getCached(101)).toBeDefined();
    respond(() => new Response(null, { status: 204 }));
    if (mutation === "update") await api.feed.update(101, { title: "Changed" });
    if (mutation === "delete") await api.feed.delete(101);
    if (mutation === "top") await api.feed.setTop(101, 1);
    if (mutation === "category") await api.category.delete(1);
    if (mutation === "config") await api.config.clearCache();
    if (mutation === "logout") await api.user.logout();
    expect(api.feed.getCached(101)).toBeUndefined();
    expect(api.feed.getCached("read-article")).toBeUndefined();
    expect(api.feed.getCachedList()).toBeUndefined();
    expect(nextTab.feed.getCached(101)).toBeUndefined();
  });

  it("does not repopulate old data when a GET finishes after a mutation in another tab", async () => {
    respond(() => publicResponse(feed));
    await api.feed.get(101);
    const resolve = delay();
    const stale = api.feed.get(101);
    respond(() => new Response(null, { status: 204 }));
    await createClient("https://blog.example").feed.delete(101);
    resolve(publicResponse(feed));
    await stale;
    expect(api.feed.getCached(101)).toBeUndefined();
  });

  it("does not let an older response overwrite a newer response", async () => {
    const resolve = delay();
    const stale = api.feed.get(101);
    respond(() => publicResponse({ ...feed, content: "Latest" }));
    await api.feed.get(101);
    resolve(publicResponse(feed));
    await stale;
    expect(api.feed.getCached(101)?.content).toBe("Latest");
  });

  it("keeps concurrent first loads from separate tabs when the cache starts empty", async () => {
    const resolve = delay();
    const first = api.feed.get(101);
    const otherTab = createClient("https://blog.example");
    respond(() => publicResponse({ ...feed, id: 102 }));
    await otherTab.feed.get(102);
    resolve(publicResponse(feed));
    await first;
    expect(otherTab.feed.getCached(101)).toBeDefined();
    expect(api.feed.getCached(102)).toBeDefined();
  });

  it("evicts all article aliases and lists on access revocation", async () => {
    respond(() => publicResponse(feed));
    await api.feed.get(101);
    await api.feed.get("read-article");
    respond(() => publicResponse(list));
    await api.feed.list();
    respond(() => new Response("Forbidden", { status: 403 }));
    await api.feed.get(101);
    expect(api.feed.getCached("read-article")).toBeUndefined();
    expect(api.feed.getCachedList()).toBeUndefined();
  });

  it("falls back to memory when payload storage fails but the shared marker is writable", async () => {
    const setItem = localStorage.setItem.bind(localStorage);
    const storage = spyOn(Object.getPrototypeOf(localStorage), "setItem").mockImplementation((key: string, value: string) => {
      if (!key.endsWith(":generation")) throw new Error("QuotaExceededError");
      setItem(key, value);
    });
    try {
      respond(() => publicResponse(feed));
      await api.feed.get(101);
      expect(api.feed.getCached(101)?.content).toBe(feed.content);
      respond(() => new Response(null, { status: 204 }));
      await api.feed.delete(101);
      expect(api.feed.getCached(101)).toBeUndefined();
    } finally { storage.mockRestore(); }
  });

  it("ignores malformed or incompatible stored data", async () => {
    respond(() => publicResponse(feed));
    await api.feed.get(101);
    const key = Object.keys(localStorage).find((key) => key.startsWith("rin:public-content:") && !key.endsWith(":generation"))!;
    const stored = JSON.parse(localStorage.getItem(key)!);
    for (const value of ["{broken", '{"entries":null}', JSON.stringify({ ...stored, entries: [{ key: "article:101", expiresAt: Date.now() + 1000, data: { ...feed, content: null } }] })]) {
      localStorage.setItem(key, value);
      expect(api.feed.getCached(101)).toBeUndefined();
    }
  });

  it("returns live articles normally when storage cannot coordinate cache invalidation", async () => {
    const storage = spyOn(Object.getPrototypeOf(localStorage), "setItem").mockImplementation(() => { throw new Error("QuotaExceededError"); });
    try {
      respond(() => publicResponse(feed));
      expect((await api.feed.get(101)).data?.content).toBe(feed.content);
      expect(api.feed.getCached(101)).toBeUndefined();
    } finally { storage.mockRestore(); }
  });

  it("bounds the cache and skips oversized articles", async () => {
    for (let id = 1; id <= 25; id++) {
      respond(() => publicResponse({ ...feed, id }));
      await api.feed.get(id);
    }
    expect(api.feed.getCached(1)).toBeUndefined();
    expect(api.feed.getCached(25)).toBeDefined();
    respond(() => publicResponse({ ...feed, content: "x".repeat(300_000) }));
    expect((await api.feed.get(101)).data?.content).toHaveLength(300_000);
    expect(api.feed.getCached(101)).toBeUndefined();
    expect(JSON.stringify(localStorage).length).toBeLessThan(256 * 1024);
  });
});
