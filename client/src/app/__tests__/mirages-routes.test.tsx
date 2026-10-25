import "../../test/setup";
import type { CategoryDetail, Feed, Page } from "@rin/api";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, jest, mock } from "bun:test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { isMiragesArticlePage, isMiragesListPage } from "../../components/site-header/layouts/mirages-routes";

const { act, cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");

const mockedRuntime = {
  endpoint: "http://localhost",
  oauth_url: "/oauth",
  client: {
    feed: { get: jest.fn(), list: jest.fn(), unlock: jest.fn(), adjacent: jest.fn() },
    page: { get: jest.fn(), list: jest.fn(), unlock: jest.fn() },
    category: { get: jest.fn() },
    search: { search: jest.fn() },
    comment: { list: jest.fn() },
  },
};
mock.module("../runtime", () => mockedRuntime);
const { client } = mockedRuntime;
mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
mock.module("../../hooks/useSiteConfig", () => ({
  useSiteConfig: () => ({ name: "Test blog", headerLayout: "mirages", feedLayout: "list", pageSize: 5, avatar: "", heroImage: "", description: "", keywords: "" }),
  useSiteNavItems: () => [],
}));
mock.module("../../hooks/useTableOfContents", () => ({ default: () => ({ TOC: null }) }));
mock.module("../../components/header", () => ({ Header: () => null }));
mock.module("../../components/footer", () => ({ default: () => null }));
mock.module("../../components/admin-layout", () => ({ AdminLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));
mock.module("../../components/dialog", () => ({
  useAlert: () => ({ showAlert: jest.fn(), AlertUI: () => null }),
  useConfirm: () => ({ showConfirm: jest.fn(), ConfirmUI: () => null }),
}));
mock.module("../../components/markdown", () => ({
  Markdown: ({ content }: { content: string }) => <div>{content}</div>,
  preloadMarkdown: () => Promise.resolve(),
}));
mock.module("../../components/feed_card", () => ({ FeedCard: ({ title }: { title: string }) => <div>{title}</div> }));
mock.module("../../components/page-templates", () => ({
  getPageTemplate: () => ({ render: ({ page }: { page: Page }) => <article>{page.content}</article> }),
}));

const { AppRoutes } = await import("../routes");

const feed: Feed = {
  id: 101, type: "post", title: "Article title", content: "Article body", slug: "article-slug",
  status: "publish", draft: 0, listed: 1, uid: 1, top: 0, pv: 1, uv: 1,
  ai_summary: "", ai_summary_status: "idle", ai_summary_error: "", cover: "/cover.jpg",
  hashtags: [], categories: [], user: { id: 1, username: "Author", avatar: null },
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};
const page: Page = {
  id: 7, title: "About page", content: "About body", slug: "about", status: "publish",
  parent: 0, order: 0, template: "default", uid: 1, createdAt: feed.createdAt, updatedAt: feed.updatedAt,
};
const category: CategoryDetail = {
  id: 2, name: "Technology", slug: "tech", description: "Tech notes", count: 0, order: 0, parent: 0,
  listed: 1, createdAt: feed.createdAt, updatedAt: feed.updatedAt, feeds: [],
};

function openRoute(path: string, strict = false) {
  const location = memoryLocation({ path });
  const routes = <Router hook={location.hook}><AppRoutes /></Router>;
  render(strict ? <StrictMode>{routes}</StrictMode> : routes);
  return location.navigate;
}

describe("Mirages content routes", () => {
  beforeEach(() => {
    for (const service of Object.values(client)) {
      for (const method of Object.values(service)) method.mockReset();
    }
    client.feed.get.mockResolvedValue({ data: feed });
    client.feed.adjacent.mockResolvedValue({ data: { previousFeed: null, nextFeed: null } });
    client.feed.list.mockResolvedValue({ data: { data: [], size: 0, hasNext: false } });
    client.feed.unlock.mockResolvedValue({});
    client.page.get.mockResolvedValue({ data: page });
    client.page.list.mockResolvedValue({ data: [] });
    client.page.unlock.mockResolvedValue({});
    client.category.get.mockResolvedValue({ data: category });
    client.search.search.mockResolvedValue({ data: { data: [{ ...feed, avatar: null, summary: "Article summary" }], size: 1, hasNext: false } });
    client.comment.list.mockResolvedValue({ data: [] });
  });
  afterEach(cleanup);

  it.each(["/feed/101", "/article-slug"])("shares one article request between the body and hero at %s", async (path) => {
    openRoute(path);
    expect(await screen.findByText("Article body")).not.toBeNull();
    // The body renders before its effect publishes the hero metadata.
    await waitFor(() => expect(screen.getAllByRole("heading", { name: "Article title", level: 1 })).toHaveLength(2));
    expect(client.feed.get).toHaveBeenCalledTimes(1);
  });

  it("uses page data for the page hero without requesting a post", async () => {
    openRoute("/page/about");
    expect(await screen.findByText("About body")).not.toBeNull();
    expect(await screen.findByRole("heading", { name: "About page", level: 1 })).not.toBeNull();
    expect(client.page.get).toHaveBeenCalledTimes(1);
    expect(client.feed.get).not.toHaveBeenCalled();
    expect(isMiragesArticlePage("/page/about")).toBe(false);
  });

  it("uses category data and a list layout for category routes", async () => {
    openRoute("/category/tech");
    expect(await screen.findByRole("heading", { name: "Technology", level: 1 })).not.toBeNull();
    expect(screen.getByText("Tech notes")).not.toBeNull();
    expect(client.category.get).toHaveBeenCalledTimes(1);
    expect(client.feed.get).not.toHaveBeenCalled();
    expect(isMiragesListPage("/category/tech")).toBe(true);
    expect(isMiragesArticlePage("/category/tech")).toBe(false);
  });

  it("clears old hero data while navigating to an article that is still loading", async () => {
    const navigate = openRoute("/feed/101");
    await screen.findByText("Article body");
    let resolveNext!: (value: { data: Feed }) => void;
    client.feed.get.mockImplementationOnce(() => new Promise((resolve) => { resolveNext = resolve; }));
    act(() => navigate("/feed/102"));
    expect(screen.queryByRole("heading", { name: "Article title", level: 1 })).toBeNull();
    await act(async () => resolveNext({ data: { ...feed, id: 102, title: "Next article", content: "Next body" } }));
    await waitFor(() => expect(screen.getAllByRole("heading", { name: "Next article", level: 1 })).toHaveLength(2));
    expect(client.feed.get).toHaveBeenCalledTimes(2);
  });

  it("renders search results with a search hero and list layout", async () => {
    openRoute("/search/article");
    expect(await screen.findByText("Article title")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "article.search.title$keyword", level: 1 })).not.toBeNull();
    expect(isMiragesListPage("/search/article")).toBe(true);
    expect(isMiragesArticlePage("/search/article")).toBe(false);
    expect(client.search.search).toHaveBeenCalledWith("article", { page: 1, limit: 5 });
    expect(client.feed.get).not.toHaveBeenCalled();
  });

  it.each([
    ["/feed/missing", "feed"],
    ["/page/missing", "page"],
    ["/category/missing", "category"],
  ] as const)("gives failed content at %s an error hero", async (path, service) => {
    client[service].get.mockRejectedValueOnce(new Error("Content unavailable"));
    openRoute(path);
    expect(await screen.findByRole("heading", { name: "Content unavailable" })).not.toBeNull();
    expect(await screen.findByRole("heading", { name: "error.title", level: 1 })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Article title", level: 1 })).toBeNull();
  });

  it.each([
    ["/feed/101", "Article body", "feed"],
    ["/page/about", "About body", "page"],
    ["/category/tech", "Tech notes", "category"],
  ] as const)("loads %s once in the app's StrictMode", async (path, text, service) => {
    openRoute(path, true);
    expect(await screen.findByText(text)).not.toBeNull();
    expect(client[service].get).toHaveBeenCalledTimes(1);
  });

  it("retries a timed-out article without leaving the page", async () => {
    client.feed.get.mockResolvedValueOnce({ error: { status: 408, value: "Request timed out" } });
    openRoute("/feed/101", true);
    await screen.findByRole("heading", { name: "error.request_timeout" });
    fireEvent.click(screen.getByRole("button", { name: "error.retry" }));
    expect(await screen.findByText("Article body")).not.toBeNull();
    expect(client.feed.get).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("error.request_timeout")).toBeNull();
  });

  it.each([0, 404, 500])("keeps the article visible when adjacent navigation fails with status %s", async (status) => {
    client.feed.adjacent.mockResolvedValue({ error: { status, value: "Navigation unavailable" } });
    openRoute("/feed/101");
    await waitFor(() => expect(client.feed.adjacent).toHaveBeenCalledWith("101"));
    expect(screen.getByText("Article body")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "error.title" })).toBeNull();
  });

  it.each([
    ["/feed/101", "feed", feed],
    ["/page/about", "page", page],
  ] as const)("shares the refreshed content after unlocking %s", async (path, service, content) => {
    if (service === "feed") {
      client.feed.get.mockResolvedValueOnce({ data: { ...feed, content: "", locked: true } });
    } else {
      client.page.get.mockResolvedValueOnce({ data: { ...page, content: "", locked: true } });
    }
    openRoute(path);
    await screen.findByText("password_required");
    expect(screen.queryByText(content.content)).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("password"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "unlock" }));
    expect(await screen.findByText(content.content)).not.toBeNull();
    expect(client[service].unlock).toHaveBeenCalledWith(content.id, "secret");
    expect(client[service].get).toHaveBeenCalledTimes(2);
    expect(client[service === "feed" ? "page" : "feed"].get).not.toHaveBeenCalled();
  });

  it("does not publish a late article response into a different page", async () => {
    let resolveArticle!: (value: { data: Feed }) => void;
    client.feed.get.mockImplementationOnce(() => new Promise((resolve) => { resolveArticle = resolve; }));
    const navigate = openRoute("/feed/101");
    act(() => navigate("/page/about"));
    await screen.findByText("About body");
    await act(async () => resolveArticle({ data: feed }));
    expect(screen.getByRole("heading", { name: "About page" })).not.toBeNull();
    expect(screen.queryByText("Article title")).toBeNull();
    expect(screen.queryByText("Article body")).toBeNull();
  });

  it("clears category metadata and leaves loading when the next request fails", async () => {
    const navigate = openRoute("/category/tech");
    await screen.findByText("Tech notes");
    client.category.get.mockRejectedValueOnce(new Error("Category unavailable"));
    act(() => navigate("/category/missing"));
    expect(await screen.findByRole("heading", { name: "Category unavailable" })).not.toBeNull();
    expect(screen.queryByText("Technology")).toBeNull();
    expect(screen.queryByText("Tech notes")).toBeNull();
  });

  it("restores the site hero when navigating home from an article", async () => {
    const navigate = openRoute("/feed/101");
    await screen.findByText("Article body");
    act(() => navigate("/"));
    expect(await screen.findByRole("heading", { name: "Test blog", level: 1 })).not.toBeNull();
    expect(screen.queryByText("Article title")).toBeNull();
    expect(client.feed.get).toHaveBeenCalledTimes(1);
  });

  it.each(["API error", "rejection", "missing data"])("leaves loading and retries the home article list after %s", async (failure) => {
    if (failure === "API error") client.feed.list.mockResolvedValueOnce({ error: { status: 408, value: "Request timed out" } });
    else if (failure === "rejection") client.feed.list.mockRejectedValueOnce(new Error("Connection lost"));
    else client.feed.list.mockResolvedValueOnce({});
    client.feed.list.mockResolvedValue({ data: { data: [{ ...feed, avatar: null, summary: "Summary" }], size: 1, hasNext: false } });
    openRoute("/", true);
    expect((await screen.findByRole("alert")).textContent).toContain("article.load_failed");
    fireEvent.click(screen.getByRole("button", { name: "error.retry" }));
    expect(await screen.findByText("Article title")).not.toBeNull();
    expect(client.feed.list).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
