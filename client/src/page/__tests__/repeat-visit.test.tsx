import "../../test/setup";
import type { Feed, FeedListResponse } from "@rin/api";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Route, Router, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { createClient } from "../../api/client";

const { act, cleanup, render, screen, waitFor } = await import("@testing-library/react");
const api = createClient("https://blog.example");
mock.module("../../app/runtime", () => ({ client: api }));
mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
mock.module("../../hooks/useSiteConfig", () => ({
  useSiteConfig: () => ({ name: "Test blog", feedLayout: "list", pageSize: 5 }),
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
const { FeedPage } = await import("../feed");
const { FeedsPage } = await import("../feeds");

const feed: Feed = {
  id: 101, type: "post", title: "Read article", content: "Read article body", slug: "read-article",
  status: "publish", draft: 0, listed: 1, uid: 1, pv: 1, uv: 1, hashtags: [], categories: [],
  ai_summary: "", ai_summary_status: "idle", ai_summary_error: "",
  user: { id: 1, username: "Author", avatar: null },
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};
const list: FeedListResponse = { data: [{ ...feed, title: "Home article", summary: "Summary", avatar: null }], size: 1, hasNext: false };
const publicResponse = (data: unknown) => Response.json(data, { headers: { "X-Rin-Content-Cache": "public" } });
const originalFetch = globalThis.fetch;
let pending: ((response: Response) => void) | undefined;
let requests: string[];
let delayPath: string | undefined;

function openRoute(path: string) {
  const location = memoryLocation({ path, record: true });
  render(<StrictMode><Router hook={location.hook}>
    <Switch>
      <Route path="/"><FeedsPage /></Route>
      <Route path="/feed/:id">{({ id }) => <FeedPage key={id} id={id!} TOC={null} />}</Route>
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
  globalThis.fetch = mock(async (input) => {
    const url = new URL(String(input));
    requests.push(url.pathname);
    if (url.pathname === delayPath) return new Promise<Response>((resolve) => { pending = resolve; });
    if (url.pathname === "/api/feed") return publicResponse(list);
    if (url.pathname === "/api/feed/101") return publicResponse(feed);
    if (url.pathname.startsWith("/api/feed/adjacent/")) return Response.json({ previousFeed: null, nextFeed: null });
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
