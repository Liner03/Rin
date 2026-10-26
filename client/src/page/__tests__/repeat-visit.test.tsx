import "../../test/setup";
import type { Feed, FeedListResponse, Page, TimelineItem } from "@rin/api";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Route, Router, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { createClient } from "../../api/client";
import { ProfileContext } from "../../state/profile";

const { act, cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const api = createClient("https://blog.example");
mock.module("../../app/runtime", () => ({ client: api }));
mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
mock.module("../../hooks/useSiteConfig", () => ({
  useSiteConfig: () => ({ name: "Test blog", feedLayout: "list", pageSize: 5, frontPage: siteFrontPage }),
}));
mock.module("../../components/dialog", () => ({
  useAlert: () => ({ showAlert: () => {}, AlertUI: () => null }),
  useConfirm: () => ({ showConfirm: () => {}, ConfirmUI: () => null }),
}));
mock.module("../../components/markdown", () => ({
  Markdown: ({ content }: { content: string }) => <div>{content}</div>,
  preloadMarkdown: () => Promise.resolve(),
}));
mock.module("../../components/feed_card", () => ({ FeedCard: ({ title }: { title: string }) => <div>{title}</div> }));
mock.module("../../components/markdown_editor", () => ({ MarkdownEditor: () => null }));
mock.module("../../components/page-templates", () => ({
  getPageTemplate: () => ({ render: ({ page }: { page: Page }) => <div>{page.content}</div> }),
}));
const { FeedPage } = await import("../feed");
const { FeedsPage } = await import("../feeds");
const { PageDetail } = await import("../page-detail");
const { TimelinePage } = await import("../timeline");
const { CategoryPage } = await import("../category");
const { HashtagPage } = await import("../hashtag");
const { HashtagsPage } = await import("../hashtags");
const { SearchPage } = await import("../search");
const { FriendsPage } = await import("../friends");
const { MomentsPage } = await import("../moments");

const feed: Feed = {
  id: 101, type: "post", title: "Read article", content: "Read article body", slug: "read-article",
  status: "publish", draft: 0, listed: 1, uid: 1, pv: 1, uv: 1, hashtags: [], categories: [],
  ai_summary: "", ai_summary_status: "idle", ai_summary_error: "",
  user: { id: 1, username: "Author", avatar: null },
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};
const list: FeedListResponse = { data: [{ ...feed, title: "Home article", summary: "Summary", avatar: null }], size: 1, hasNext: false };
const page: Page = { ...feed, id: 7, slug: "about", title: "About", content: "About body", parent: 0, order: 0, template: "" };
const timeline: TimelineItem[] = [{ id: 101, title: "Archive article", createdAt: feed.createdAt }];
const category = { id: 1, name: "Engineering", slug: "engineering", description: "", parent: 0, order: 0, listed: 1, count: 1, createdAt: feed.createdAt, updatedAt: feed.updatedAt, feeds: [{ ...list.data[0], title: "Category article" }] };
const tag = { id: 2, name: "TypeScript", count: 1, createdAt: feed.createdAt, updatedAt: feed.updatedAt, feeds: [{ ...feed, summary: "Tag summary", title: "Tagged article" }] };
const friends = { friend_list: [{ id: 1, uid: 1, name: "Public friend", desc: "", avatar: "", url: "https://friend.example", accepted: 1, health: "", createdAt: feed.createdAt, updatedAt: feed.updatedAt }], apply_list: null };
const moments = { data: [{ id: 1, content: "Cached moment", user: feed.user, createdAt: feed.createdAt, updatedAt: feed.updatedAt }], hasNext: false };
const publicResponse = (data: unknown) => Response.json(data, { headers: { "X-Rin-Content-Cache": "public" } });
const originalFetch = globalThis.fetch;
let pending: ((response: Response) => void) | undefined;
let requests: string[];
let delayPath: string | undefined;
let siteFrontPage: string | undefined;

function openRoute(path: string) {
  const location = memoryLocation({ path, record: true });
  render(<StrictMode><Router hook={() => {
    const [path, navigate] = location.hook();
    return [path.split("?")[0], navigate];
  }} searchHook={() => location.hook()[0].split("?")[1] ?? ""}>
    <Switch>
      <Route path="/"><FeedsPage /></Route>
      <Route path="/feed/:id">{({ id }) => <FeedPage key={id} id={id!} TOC={null} />}</Route>
      <Route path="/page/:slug">{({ slug }) => <PageDetail slug={slug!} />}</Route>
      <Route path="/timeline"><TimelinePage /></Route>
      <Route path="/category/:slug">{({ slug }) => <CategoryPage slug={slug!} />}</Route>
      <Route path="/hashtag/:name">{({ name }) => <HashtagPage name={name!} />}</Route>
      <Route path="/hashtags"><HashtagsPage /></Route>
      <Route path="/search/:keyword">{({ keyword }) => <SearchPage keyword={keyword!} />}</Route>
      <Route path="/friends"><FriendsPage /></Route>
      <Route path="/moments"><MomentsPage /></Route>
      <Route path="/away"><div>Away</div></Route>
    </Switch>
  </Router></StrictMode>);
  return location.navigate;
}

beforeEach(() => {
  localStorage.clear();
  requests = [];
  delayPath = undefined;
  pending = undefined;
  siteFrontPage = undefined;
  globalThis.fetch = mock(async (input) => {
    const url = new URL(String(input));
    requests.push(url.pathname);
    if (url.pathname === delayPath) return new Promise<Response>((resolve) => { pending = resolve; });
    if (url.pathname === "/api/feed") return publicResponse(list);
    if (url.pathname === "/api/feed/101") return publicResponse(feed);
    if (url.pathname === "/api/page/about") return publicResponse(page);
    if (url.pathname === "/api/page/7") return publicResponse(page);
    if (url.pathname === "/api/page/contact") return publicResponse({ ...page, id: 8, slug: "contact", content: "Contact body" });
    if (url.pathname === "/api/feed/timeline") return publicResponse(timeline);
    if (url.pathname === "/api/category/engineering") return publicResponse(category);
    if (url.pathname === "/api/tag/TypeScript") return publicResponse(tag);
    if (url.pathname === "/api/tag") return publicResponse([tag]);
    if (url.pathname === "/api/search/cache") return publicResponse(list);
    if (url.pathname === "/api/friend" || url.pathname === "/api/friend/public") return publicResponse(friends);
    if (url.pathname === "/api/moments") return publicResponse(moments);
    if (url.pathname.startsWith("/api/feed/adjacent/")) return publicResponse({ previousFeed: null, nextFeed: null });
    if (url.pathname.startsWith("/api/comment/")) return publicResponse([]);
    return Response.json([]);
  }) as typeof fetch;
});

afterEach(async () => {
  cleanup();
  pending?.(new Response("Unavailable", { status: 503 }));
  await Promise.resolve();
  globalThis.fetch = originalFetch;
});

describe("repeat visits with a slow API", () => {
  it("reuses a custom homepage while its page request is pending", async () => {
    siteFrontPage = "7";
    const navigate = openRoute("/");
    await screen.findByText("About body");
    act(() => navigate("/away"));
    delayPath = "/api/page/7";
    act(() => navigate("/"));
    expect(screen.queryByText("About body")).not.toBeNull();
    expect(screen.queryByText("Home article")).toBeNull();
    expect(requests.filter((path) => path === delayPath)).toHaveLength(2);
    await act(async () => pending!(publicResponse({ ...page, content: "Fresh homepage body" })));
    await screen.findByText("Fresh homepage body");
  });

  it.each(["/page/about", "/timeline"])("retains cached content on transient failures and removes it on revocation at %s", async (route) => {
    const isPage = route === "/page/about";
    const text = isPage ? "About body" : "Archive article";
    const navigate = openRoute(route);
    await screen.findByText(text);
    for (const status of [0, 408, 429, 503, 403, 404]) {
      act(() => navigate("/away"));
      delayPath = isPage ? "/api/page/about" : "/api/feed/timeline";
      act(() => navigate(route));
      if (status !== 404) expect(screen.queryByText(text)).not.toBeNull();
      await act(async () => pending!(status === 0 ? Response.error() : new Response("Unavailable", { status })));
      if (status === 403 || status === 404) {
        expect(screen.queryByText(text)).toBeNull();
        expect(isPage ? api.page.getCached("about") : api.feed.getCachedTimeline()).toBeUndefined();
      } else {
        expect(screen.queryByText(text)).not.toBeNull();
        expect(screen.queryByRole("alert")).toBeNull();
      }
    }
  });

  it("replaces a cached custom page with the password prompt and unlocks without persisting the body", async () => {
    const navigate = openRoute("/page/about");
    await screen.findByText("About body");
    act(() => navigate("/away"));
    delayPath = "/api/page/about";
    act(() => navigate("/page/about"));
    await act(async () => pending!(Response.json({ ...page, content: "", hasPassword: true, locked: true })));
    await screen.findByText("password_required");
    expect(screen.queryByText("About body")).toBeNull();
    expect(api.page.getCached("about")).toBeUndefined();
    globalThis.fetch = mock(async (input) => String(input).endsWith("/unlock")
      ? new Response(null, { status: 204 })
      : Response.json({ ...page, hasPassword: true, locked: false })) as typeof fetch;
    fireEvent.change(screen.getByPlaceholderText("password"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "unlock" }));
    await screen.findByText("About body");
    expect(api.page.getCached("about")).toBeUndefined();
  });

  it("ignores a page response arriving after navigation to another page", async () => {
    delayPath = "/api/page/about";
    const navigate = openRoute("/page/about");
    const resolveAbout = pending!;
    act(() => navigate("/page/contact"));
    await screen.findByText("Contact body");
    await act(async () => resolveAbout(publicResponse(page)));
    expect(screen.queryByText("About body")).toBeNull();
    expect(screen.queryByText("Contact body")).not.toBeNull();
  });

  it("shows an archive error and lets an uncached first visit retry", async () => {
    globalThis.fetch = mock(async () => new Response("Unavailable", { status: 503 })) as typeof fetch;
    openRoute("/timeline");
    await screen.findByRole("alert");
    globalThis.fetch = mock(async () => publicResponse(timeline)) as typeof fetch;
    fireEvent.click(screen.getByRole("button", { name: "error.retry" }));
    await screen.findByText("Archive article");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each(["HTTP failure", "rejected request"])("uses another tab's cache when an initially uncached article ends in %s", async (failure) => {
    delayPath = "/api/feed/101";
    let rejectRequest!: (error: Error) => void;
    const get = failure === "rejected request"
      ? spyOn(api.feed, "get").mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRequest = reject; }))
      : undefined;
    try {
      openRoute("/feed/101");
      expect(screen.queryByText("Read article body")).toBeNull();
      const firstTabFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => publicResponse(feed)) as typeof fetch;
      await createClient("https://blog.example").feed.get(101);
      globalThis.fetch = firstTabFetch;
      expect(api.feed.getCached(101)?.content).toBe("Read article body");
      await act(async () => {
        if (failure === "HTTP failure") pending!(new Response("Unavailable", { status: 503 }));
        else rejectRequest(new Error("Connection lost"));
      });
      expect(screen.queryByText("Read article body")).not.toBeNull();
      expect(screen.queryByRole("button", { name: "error.retry" })).toBeNull();
    } finally { get?.mockRestore(); }
  });

  it.each([
    ["/", "/api/feed", "Home article", { ...list, data: [{ ...list.data[0], title: "Fresh home article" }] }, "Fresh home article"],
    ["/feed/101", "/api/feed/101", "Read article body", { ...feed, content: "Fresh article body" }, "Fresh article body"],
    ["/page/about", "/api/page/about", "About body", { ...page, content: "Fresh about body" }, "Fresh about body"],
    ["/timeline", "/api/feed/timeline", "Archive article", [{ ...timeline[0], title: "Fresh archive article" }], "Fresh archive article"],
    ["/category/engineering", "/api/category/engineering", "Category article", { ...category, feeds: [{ ...category.feeds[0], title: "Fresh category article" }] }, "Fresh category article"],
    ["/hashtag/TypeScript", "/api/tag/TypeScript", "Tagged article", { ...tag, feeds: [{ ...feed, summary: "Tag summary", title: "Fresh tagged article" }] }, "Fresh tagged article"],
    ["/hashtags", "/api/tag", "TypeScript", [{ ...tag, name: "Fresh tag" }], "Fresh tag"],
    ["/search/cache", "/api/search/cache", "Home article", { ...list, data: [{ ...list.data[0], title: "Fresh search article" }] }, "Fresh search article"],
    ["/friends", "/api/friend/public", "Public friend", { ...friends, friend_list: [{ ...friends.friend_list[0], name: "Fresh friend" }] }, "Fresh friend"],
    ["/moments", "/api/moments", "Cached moment", { ...moments, data: [{ ...moments.data[0], content: "Fresh moment" }] }, "Fresh moment"],
  ] as const)("shows previously read content at %s before revalidation finishes", async (route, endpoint, text, fresh, freshText) => {
    const navigate = openRoute(route);
    await screen.findByText(text);
    act(() => navigate("/away"));
    delayPath = endpoint;
    act(() => navigate(route));
    // The second network response has not arrived. This is the user's slow revisit.
    expect(screen.queryByText(text)).not.toBeNull();
    expect(requests.filter((path) => path === endpoint)).toHaveLength(2);
    await act(async () => pending!(publicResponse(fresh)));
    await screen.findByText(freshText);
    expect(screen.queryByText(text)).toBeNull();
  });

  it.each([0, 408, 429, 503, 403, 404])("handles a repeated article visit returning status %s", async (status) => {
    const navigate = openRoute("/feed/101");
    await screen.findByText("Read article body");
    act(() => navigate("/away"));
    delayPath = "/api/feed/101";
    act(() => navigate("/feed/101"));
    expect(screen.queryByText("Read article body")).not.toBeNull();
    await act(async () => pending!(status === 0 ? Response.error() : new Response("Unavailable", { status })));
    if (status === 403 || status === 404) {
      await waitFor(() => expect(screen.queryByText("Read article body")).toBeNull());
      expect(api.feed.getCached(101)).toBeUndefined();
    } else {
      expect(screen.queryByText("Read article body")).not.toBeNull();
      expect(screen.queryByRole("button", { name: "error.retry" })).toBeNull();
    }
  });

  it("replaces cached text with the password prompt when protection is enabled", async () => {
    const navigate = openRoute("/feed/101");
    await screen.findByText("Read article body");
    act(() => navigate("/away"));
    delayPath = "/api/feed/101";
    act(() => navigate("/feed/101"));
    await act(async () => pending!(Response.json({ ...feed, content: "", hasPassword: true, locked: true })));
    await screen.findByText("password_required");
    expect(screen.queryByText("Read article body")).toBeNull();
    expect(api.feed.getCached(101)).toBeUndefined();
  });

  it.each([503, 403])("handles a repeated home visit returning status %s", async (status) => {
    const navigate = openRoute("/");
    await screen.findByText("Home article");
    act(() => navigate("/away"));
    delayPath = "/api/feed";
    act(() => navigate("/"));
    await act(async () => pending!(new Response("Unavailable", { status })));
    if (status === 403) {
      expect(screen.queryByText("Home article")).toBeNull();
      expect(screen.queryByRole("alert")).not.toBeNull();
    } else {
      expect(screen.queryByText("Home article")).not.toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
    }
  });
});

it("shows cached load-more moments immediately, replaces them, and retries the same page after revocation", async () => {
  const second = { data: [{ ...moments.data[0], id: 2, content: "Second cached moment" }], hasNext: false };
  globalThis.fetch = mock(async () => publicResponse({ ...moments, hasNext: true })) as typeof fetch;
  await api.moments.list({ page: 1, limit: 5 });
  globalThis.fetch = mock(async () => publicResponse(second)) as typeof fetch;
  await api.moments.list({ page: 2, limit: 5 });
  let resolveMore!: (response: Response) => void;
  const requestedPages: string[] = [];
  globalThis.fetch = mock(async (input) => {
    const url = new URL(String(input));
    const page = url.searchParams.get("page")!;
    requestedPages.push(page);
    if (page === "1") return publicResponse({ ...moments, hasNext: true });
    return new Promise<Response>(resolve => { resolveMore = resolve; });
  }) as typeof fetch;
  openRoute("/moments");
  await screen.findByText("Cached moment");
  fireEvent.click(screen.getByRole("button", { name: "load_more" }));
  expect(screen.queryByText("Second cached moment")).not.toBeNull();
  await act(async () => resolveMore(new Response("Forbidden", { status: 403 })));
  expect(screen.queryByText("Second cached moment")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "error.retry" }));
  expect(requestedPages).toEqual(["1", "2", "2"]);
  await act(async () => resolveMore(publicResponse({ ...second, data: [{ ...second.data[0], content: "Fresh second moment" }] })));
  await screen.findByText("Fresh second moment");
  expect(screen.getAllByText("Cached moment")).toHaveLength(1);
  expect(screen.queryByText("Second cached moment")).toBeNull();
});

it("loads a new moments limit while the old load-more request is pending", async () => {
  let resolveOld!: (response: Response) => void;
  globalThis.fetch = mock(async (input) => {
    const url = new URL(String(input));
    if (url.searchParams.get("limit") === "2") return publicResponse({ ...moments, data: [{ ...moments.data[0], content: "New limit moment" }] });
    if (url.searchParams.get("page") === "2") return new Promise<Response>(resolve => { resolveOld = resolve; });
    return publicResponse({ ...moments, hasNext: true });
  }) as typeof fetch;
  const navigate = openRoute("/moments");
  await screen.findByText("Cached moment");
  fireEvent.click(screen.getByRole("button", { name: "load_more" }));
  act(() => navigate("/moments?limit=2"));
  await screen.findByText("New limit moment");
  await act(async () => resolveOld(publicResponse({ ...moments, data: [{ ...moments.data[0], id: 2, content: "Old late moment" }] })));
  expect(screen.queryByText("Cached moment")).toBeNull();
  expect(screen.queryByText("Old late moment")).toBeNull();
});


it.each([
  ["/api/comment/101", [{ id: 1, content: "Cached comment", approved: 1, user: null, guestName: "Reader", createdAt: feed.createdAt }], "Cached comment",
    [{ id: 1, content: "Fresh comment", approved: 1, user: null, guestName: "Reader", createdAt: feed.createdAt }], "Fresh comment"],
  ["/api/feed/adjacent/101", { previousFeed: { ...list.data[0], title: "Cached adjacent" }, nextFeed: null }, "Cached adjacent",
    { previousFeed: { ...list.data[0], title: "Fresh adjacent" }, nextFeed: null }, "Fresh adjacent"],
] as const)("reuses article ancillary content at %s while revalidating", async (endpoint, data, text, fresh, freshText) => {
  const original = globalThis.fetch;
  globalThis.fetch = mock((input, init) => new URL(String(input)).pathname === endpoint && delayPath !== endpoint
    ? Promise.resolve(publicResponse(data)) : original(input, init)) as typeof fetch;
  const navigate = openRoute("/feed/101");
  await screen.findByText(text);
  act(() => navigate("/away"));
  delayPath = endpoint;
  act(() => navigate("/feed/101"));
  await waitFor(() => expect(pending).toBeDefined());
  expect(screen.queryByText(text)).not.toBeNull();
  await act(async () => pending!(publicResponse(fresh)));
  await screen.findByText(freshText);
  expect(screen.queryByText(text)).toBeNull();
});

it("discards personal friend data immediately on viewer changes and ignores the previous viewer's late response", async () => {
  let resolveOld!: (response: Response) => void;
  let personalRequests = 0;
  const personal = { ...friends, apply_list: { ...friends.friend_list[0], accepted: 0, name: "Private application" } };
  globalThis.fetch = mock(async (input) => {
    if (String(input).endsWith("/public")) return publicResponse(friends);
    personalRequests++;
    if (personalRequests === 1) return Response.json(personal);
    return new Promise<Response>(resolve => { resolveOld = resolve; });
  }) as typeof fetch;
  const profile = { id: 1, name: "Reader", avatar: "", permission: false };
  const view = render(<ProfileContext.Provider value={profile}><FriendsPage /></ProfileContext.Provider>);
  await screen.findByText("Private application");
  expect(JSON.stringify(localStorage)).not.toContain("Private application");
  view.rerender(<ProfileContext.Provider value={{ ...profile, id: 2 }}><FriendsPage /></ProfileContext.Provider>);
  expect(screen.queryByText("Private application")).toBeNull();
  view.rerender(<ProfileContext.Provider value={null}><FriendsPage /></ProfileContext.Provider>);
  await screen.findByText("Public friend");
  await act(async () => resolveOld(Response.json(personal)));
  expect(screen.queryByText("Private application")).toBeNull();
  expect(screen.queryByText("Public friend")).not.toBeNull();
});

it.each([
  ["end of list", "first", false], ["end of list", "second", false],
  ["changed first-page boundary", "first", true], ["changed first-page boundary", "second", true],
] as const)("discards obsolete later moments after %s when the %s page resolves first", async (_change, order, hasNext) => {
  globalThis.fetch = mock(async () => publicResponse({ ...moments, hasNext: true })) as typeof fetch;
  await api.moments.list({ page: 1, limit: 5 });
  const fresh = { ...moments, data: [{ ...moments.data[0], id: hasNext ? 3 : 1, content: "Refreshed first page" }], hasNext };
  let resolveFirst!: (response: Response) => void;
  let resolveSecond!: (response: Response) => void;
  globalThis.fetch = mock(async input => new Promise<Response>(resolve => {
    if (new URL(String(input)).searchParams.get("page") === "1") resolveFirst = resolve;
    else resolveSecond = resolve;
  })) as typeof fetch;
  openRoute("/moments");
  fireEvent.click(screen.getByRole("button", { name: "load_more" }));
  const finishFirst = () => resolveFirst(publicResponse(fresh));
  const finishSecond = () => resolveSecond(publicResponse({ data: [{ ...moments.data[0], id: 2, content: "Obsolete second page" }], hasNext: false }));
  if (order === "first") {
    await act(async () => finishFirst());
    await act(async () => finishSecond());
  } else {
    await act(async () => finishSecond());
    await screen.findByText("Obsolete second page");
    await act(async () => finishFirst());
  }
  expect(screen.queryByText("Obsolete second page")).toBeNull();
  expect(screen.queryByText("Refreshed first page")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "load_more" }) !== null).toBe(hasNext);
});

it("does not revive an obsolete moments page from cache after the first-page boundary changes", async () => {
  globalThis.fetch=mock(async()=>publicResponse({...moments,hasNext:true})) as typeof fetch;
  await api.moments.list({page:1,limit:5});
  let resolveFirst!:(r:Response)=>void;
  let resolveSecond!:(r:Response)=>void;
  globalThis.fetch=mock(async(input)=>new Promise<Response>(resolve=>{
    if(new URL(String(input)).searchParams.get("page")==="1") resolveFirst=resolve;
    else resolveSecond=resolve;
  })) as typeof fetch;
  openRoute("/moments");
  fireEvent.click(screen.getByRole("button",{name:"load_more"}));
  await act(async()=>resolveFirst(publicResponse({...moments,data:[{...moments.data[0],id:3,content:"New first page"}],hasNext:true})));
  await act(async()=>resolveSecond(publicResponse({...moments,data:[{...moments.data[0],id:2,content:"Obsolete cached append"}],hasNext:false})));
  expect(screen.queryByText("Obsolete cached append") !== null).toBe(false);
  globalThis.fetch=mock(async()=>new Response("Unavailable",{status:503})) as typeof fetch;
  fireEvent.click(screen.getByRole("button",{name:"load_more"}));
  await act(async()=>{await Promise.resolve()});
  expect(screen.queryByText("Obsolete cached append") !== null).toBe(false);
});
