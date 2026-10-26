import "../../test/setup";
import type { Feed, FeedListResponse, Page, TimelineItem } from "@rin/api";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { createClient } from "../client";
import { PublicContentCache } from "../public-content-cache";

const feed: Feed = {
  id: 101, type: "post", title: "Read article", content: "Read article body", slug: "read-article",
  status: "publish", draft: 0, listed: 1, uid: 1, pv: 1, uv: 1, hashtags: [], categories: [],
  ai_summary: "", ai_summary_status: "idle", ai_summary_error: "",
  user: { id: 1, username: "Author", avatar: null },
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};
const list: FeedListResponse = { data: [{ ...feed, summary: "Summary", avatar: null }], size: 1, hasNext: false };
const page: Page = { ...feed, id: 7, title: "About", content: "About body", slug: "about", parent: 0, order: 0, template: "" };
const timeline: TimelineItem[] = [{ id: feed.id, title: feed.title, createdAt: feed.createdAt }];
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
  it("persists custom pages and archives across clients while revalidating on every visit", async () => {
    respond(() => publicResponse(page));
    await api.page.get("about");
    const nextTab = createClient("https://blog.example");
    expect(nextTab.page.getCached("about")?.content).toBe("About body");
    expect(nextTab.page.getCached("7")).toBeUndefined();
    expect(nextTab.feed.getCached(7)).toBeUndefined();
    expect(createClient("https://other.example").page.getCached("about")).toBeUndefined();
    await nextTab.page.get("about");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    respond(() => publicResponse(timeline));
    await api.feed.timeline();
    expect(nextTab.feed.getCachedTimeline()).toEqual(timeline);
    expect(createClient("https://other.example").feed.getCachedTimeline()).toBeUndefined();
    await nextTab.feed.timeline();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("requires public markers for pages and archives and ignores invalid payloads", async () => {
    for (const response of [Response.json(page), publicResponse({ ...page, template: null }), publicResponse({ ...page, fields: {} })]) {
      respond(() => response);
      await api.page.get("about");
      expect(api.page.getCached("about")).toBeUndefined();
    }
    for (const response of [Response.json(timeline), publicResponse([{}]), publicResponse([{ ...timeline[0], createdAt: "invalid" }])]) {
      respond(() => response);
      await api.feed.timeline();
      expect(api.feed.getCachedTimeline()).toBeUndefined();
    }
    respond(() => publicResponse([]));
    await api.feed.timeline();
    expect(api.feed.getCachedTimeline()).toEqual([]);
  });

  it.each([
    { ...page, status: "draft" }, { ...page, status: "private" }, { ...page, status: "hidden" },
    { ...page, locked: true }, { ...page, hasPassword: true, locked: false },
    { ...page, createdAt: "2999-01-01T00:00:00Z" },
  ])("does not persist protected or unpublished custom pages: %o", async (data) => {
    respond(() => publicResponse(data));
    await api.page.get("about");
    expect(api.page.getCached("about")).toBeUndefined();
    expect(JSON.stringify(localStorage)).not.toContain(page.content);
  });

  it("expires pages and archives after five minutes without extending stale data on failures", async () => {
    const now = Date.now();
    const clock = spyOn(Date, "now").mockReturnValue(now);
    try {
      respond(() => publicResponse(page));
      await api.page.get("about");
      respond(() => publicResponse(timeline));
      await api.feed.timeline();
      clock.mockReturnValue(now + 299_000);
      respond(() => new Response("Unavailable", { status: 503 }));
      await api.page.get("about");
      await api.feed.timeline();
      expect(api.page.getCached("about")).toBeDefined();
      expect(api.feed.getCachedTimeline()).toEqual(timeline);
      clock.mockReturnValue(now + 300_001);
      expect(api.page.getCached("about")).toBeUndefined();
      expect(api.feed.getCachedTimeline()).toBeUndefined();
    } finally { clock.mockRestore(); }
  });

  it.each(["page update", "page delete", "feed update", "logout", "clear cache"])("invalidates pages and archives across clients after %s", async (mutation) => {
    respond(() => publicResponse(page));
    await api.page.get("about");
    await api.page.get("7");
    respond(() => publicResponse(timeline));
    await api.feed.timeline();
    const nextTab = createClient("https://blog.example");
    expect(nextTab.page.getCached("about")).toBeDefined();
    expect(nextTab.feed.getCachedTimeline()).toEqual(timeline);
    respond(() => new Response(null, { status: 204 }));
    if (mutation === "page update") await api.page.update(7, { title: "Changed" });
    if (mutation === "page delete") await api.page.delete(7);
    if (mutation === "feed update") await api.feed.update(101, { title: "Changed" });
    if (mutation === "logout") await api.user.logout();
    if (mutation === "clear cache") await api.config.clearCache();
    expect(nextTab.page.getCached("about")).toBeUndefined();
    expect(nextTab.page.getCached("7")).toBeUndefined();
    expect(nextTab.feed.getCachedTimeline()).toBeUndefined();
  });

  it("does not revive page data if an old request completes after another tab edits the page", async () => {
    const resolve = delay();
    const load = api.page.get("about");
    respond(() => new Response(null, { status: 204 }));
    await createClient("https://blog.example").page.update(7, { title: "Changed" });
    resolve(publicResponse(page));
    await load;
    expect(api.page.getCached("about")).toBeUndefined();
  });

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

const summary = { ...list.data[0], content: undefined };
const publicFriend = { id: 1, name: "Friend", url: "https://friend.example", health: "", accepted: 1 };
const approvedComment = { id: 1, content: "Public comment", approved: 1, createdAt: feed.createdAt };
const tag = { id: 1, name: "Cache", count: 1, createdAt: feed.createdAt, updatedAt: feed.updatedAt };
const resources: { name: string; data: unknown; load: () => Promise<unknown>; read: () => unknown; other: () => unknown }[] = [
  { name: "navigation", data: [{ title: "About", slug: "about" }], load: () => api.page.navigation(), read: () => api.page.getCachedNavigation(), other: () => api.page.getCached("about") },
  { name: "category", data: { id: 1, name: "Cache", feeds: [summary] }, load: () => api.category.get("cache"), read: () => api.category.getCached("cache"), other: () => api.category.getCached("other") },
  { name: "tags", data: [tag], load: () => api.tag.list(), read: () => api.tag.getCachedList(), other: () => api.tag.getCached("Cache") },
  { name: "tag", data: { ...tag, feeds: [summary] }, load: () => api.tag.get("Cache"), read: () => api.tag.getCached("Cache"), other: () => api.tag.getCached("other") },
  { name: "friends", data: { friend_list: [publicFriend], apply_list: null }, load: () => api.friend.listPublic(), read: () => api.friend.getCachedPublic(), other: () => undefined },
  { name: "moments", data: { data: [{ id: 1, content: "Moment", createdAt: feed.createdAt, updatedAt: feed.updatedAt, user: feed.user }], hasNext: true }, load: () => api.moments.list({ page: 2, limit: 5 }), read: () => api.moments.getCachedList({ page: 2, limit: 5 }), other: () => api.moments.getCachedList({ page: 1, limit: 5 }) },
  { name: "search", data: list, load: () => api.search.search("cache", { page: 2, limit: 5 }), read: () => api.search.getCached("cache", { page: 2, limit: 5 }), other: () => api.search.getCached("cache", { page: 2, limit: 20 }) },
  { name: "comments", data: [approvedComment], load: () => api.comment.list(101), read: () => api.comment.getCached(101), other: () => api.comment.getCached(102) },
  { name: "adjacent", data: { previousFeed: summary, nextFeed: null }, load: () => api.feed.adjacent(101), read: () => api.feed.getCachedAdjacent(101), other: () => api.feed.getCachedAdjacent(102) },
];

describe.each(resources)("$name public cache policy", ({ data, load, read, other }) => {
  it("persists public data by resource and revalidates on each call", async () => {
    respond(() => publicResponse(data));
    await load();
    expect(read()).toEqual(data);
    expect(other()).toBeUndefined();
    const firstClient = api;
    api = createClient("https://other.example");
    expect(read()).toBeUndefined();
    api = createClient("https://blog.example");
    expect(read()).toEqual(data);
    await load();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    api = firstClient;
  });

  it("requires the public marker and removes cached data on 403/404", async () => {
    respond(() => Response.json(data));
    await load();
    expect(read()).toBeUndefined();
    for (const status of [403, 404]) {
      respond(() => publicResponse(data));
      await load();
      expect(read()).toBeDefined();
      respond(() => new Response("Unavailable", { status }));
      await load();
      expect(read()).toBeUndefined();
    }
  });

  it("keeps transient fallback only within five minutes", async () => {
    const now = Date.now();
    const clock = spyOn(Date, "now").mockReturnValue(now);
    try {
      respond(() => publicResponse(data));
      await load();
      clock.mockReturnValue(now + 299_000);
      respond(() => new Response("Unavailable", { status: 503 }));
      await load();
      expect(read()).toEqual(data);
      clock.mockReturnValue(now + 300_001);
      expect(read()).toBeUndefined();
    } finally { clock.mockRestore(); }
  });

  it("invalidates across clients and rejects a pre-mutation response", async () => {
    respond(() => publicResponse(data));
    await load();
    const resolve = delay();
    const stale = load();
    respond(() => new Response(null, { status: 204 }));
    await createClient("https://blog.example").config.clearCache();
    expect(read()).toBeUndefined();
    resolve(publicResponse(data));
    await stale;
    expect(read()).toBeUndefined();
  });
});

it("never persists personalized friend applications or unapproved comments/emails", async () => {
  const personal = { friend_list: [publicFriend], apply_list: [{ ...publicFriend, accepted: 0, name: "Private application" }] };
  respond(() => publicResponse(personal));
  await api.friend.list();
  await api.friend.listPublic();
  expect(api.friend.getCachedPublic()).toBeUndefined();
  expect(JSON.stringify(localStorage)).not.toContain("Private application");
  for (const comment of [{ ...approvedComment, approved: 0 }, { ...approvedComment, guestEmail: "private@example.com" }]) {
    respond(() => publicResponse([comment]));
    await api.comment.list(101);
    expect(api.comment.getCached(101)).toBeUndefined();
    expect(JSON.stringify(localStorage)).not.toContain("private@example.com");
  }
});

it("notifies same-origin subscribers after successful mutations, with removable subscriptions", async () => {
  const listener = mock(() => {});
  const otherOrigin = mock(() => {});
  const unsubscribe = api.subscribeContentChanges(listener);
  const stopOther = createClient("https://other.example").subscribeContentChanges(otherOrigin);
  try {
    respond(() => new Response("Forbidden", { status: 403 }));
    await api.page.delete(7);
    expect(listener).not.toHaveBeenCalled();
    respond(() => new Response(null, { status: 204 }));
    await createClient("https://blog.example").page.delete(7);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(otherOrigin).not.toHaveBeenCalled();
    unsubscribe();
    await api.config.clearCache();
    expect(listener).toHaveBeenCalledTimes(1);
  } finally { unsubscribe(); stopOther(); }
});

it("revokes old paginated moment cache tickets across clients while retaining the fresh first page and other resources", async () => {
  const first = { data: [{ id: 1, content: "First", createdAt: feed.createdAt, updatedAt: feed.updatedAt, user: feed.user }], hasNext: true };
  const second = { ...first, data: [{ ...first.data[0], id: 2, content: "Obsolete second" }], hasNext: false };
  respond(() => publicResponse(first));
  await api.moments.list({ page: 1, limit: 5 });
  respond(() => publicResponse(second));
  await api.moments.list({ page: 2, limit: 5 });
  respond(() => publicResponse(feed));
  await api.feed.get(101);
  const otherTab = createClient("https://blog.example");
  const resolveOld = delay();
  const oldLoad = otherTab.moments.list({ page: 2, limit: 5 });
  const fresh = { ...first, data: [{ ...first.data[0], id: 3, content: "Fresh first" }] };
  respond(() => publicResponse(fresh));
  await api.moments.list({ page: 1, limit: 5 });
  expect(otherTab.moments.getCachedList({ page: 2, limit: 5 })).toBeUndefined();
  resolveOld(publicResponse(second));
  await oldLoad;
  expect(api.moments.getCachedList({ page: 2, limit: 5 })).toBeUndefined();
  expect(otherTab.moments.getCachedList({ page: 1, limit: 5 })).toEqual(fresh);
  expect(otherTab.feed.getCached(101)).toEqual(feed);
});


it.each(["concurrent logout", "scope marker write failure"])("cannot revive other resources when pagination reset encounters %s", async failure => {
  const first = { data: [{ id: 1, content: "First", createdAt: feed.createdAt, updatedAt: feed.updatedAt, user: feed.user }], hasNext: true };
  respond(() => publicResponse(first));
  await api.moments.list({ page: 1, limit: 5 });
  respond(() => publicResponse(feed));
  await api.feed.get(101);
  const otherTabCache = new PublicContentCache("https://blog.example");
  const setItem = localStorage.setItem.bind(localStorage);
  let injected = false;
  const storage = spyOn(Object.getPrototypeOf(localStorage), "setItem").mockImplementation((key: string, value: string) => {
    if (key.endsWith(":scope:moments:generation") && !injected) {
      injected = true;
      if (failure === "scope marker write failure") throw new Error("Storage denied");
      setItem(key, value);
      otherTabCache.clear(true);
    } else setItem(key, value);
  });
  try {
    respond(() => publicResponse({ ...first, data: [{ ...first.data[0], id: 3 }] }));
    await api.moments.list({ page: 1, limit: 5 });
    expect(injected).toBe(true);
    expect(api.moments.getCachedList({ page: 1, limit: 5 })).toBeUndefined();
    expect(createClient("https://blog.example").feed.getCached(101)).toBeUndefined();
  } finally { storage.mockRestore(); }
});

it("drops cached later moment pages when the first page has expired and cannot establish their boundary", async () => {
  const now = Date.now();
  const clock = spyOn(Date, "now").mockReturnValue(now);
  const first = { data: [{ id: 1, content: "First", createdAt: feed.createdAt, updatedAt: feed.updatedAt, user: feed.user }], hasNext: true };
  try {
    respond(() => publicResponse(first));
    await api.moments.list({ page: 1, limit: 5 });
    clock.mockReturnValue(now + 250_000);
    respond(() => publicResponse({ ...first, data: [{ ...first.data[0], id: 2 }], hasNext: false }));
    await api.moments.list({ page: 2, limit: 5 });
    clock.mockReturnValue(now + 300_001);
    expect(api.moments.getCachedList({ page: 1, limit: 5 })).toBeUndefined();
    expect(api.moments.getCachedList({ page: 2, limit: 5 })).toBeDefined();
    respond(() => publicResponse(first));
    await api.moments.list({ page: 1, limit: 5 });
    expect(api.moments.getCachedList({ page: 2, limit: 5 })).toBeUndefined();
    expect(api.moments.getCachedList({ page: 1, limit: 5 })).toEqual(first);
  } finally { clock.mockRestore(); }
});
