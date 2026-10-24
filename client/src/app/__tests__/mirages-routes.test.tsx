import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CategoryDetail, Feed, Page } from "@rin/api";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { client } from "../runtime";
import { AppRoutes } from "../routes";
import { isMiragesArticlePage, isMiragesListPage } from "../../components/site-header/layouts/mirages-routes";

vi.mock("../runtime", () => ({
  client: {
    feed: { get: vi.fn(), list: vi.fn(), unlock: vi.fn() },
    page: { get: vi.fn(), list: vi.fn(), unlock: vi.fn() },
    category: { get: vi.fn() },
    search: { search: vi.fn() },
    comment: { list: vi.fn() },
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../../hooks/useSiteConfig", () => ({
  useSiteConfig: () => ({ name: "Test blog", headerLayout: "mirages", feedLayout: "list", pageSize: 5, avatar: "", heroImage: "", description: "", keywords: "" }),
  useSiteNavItems: () => [],
}));
vi.mock("../../hooks/useTableOfContents", () => ({ default: () => ({ TOC: null }) }));
vi.mock("../../components/header", () => ({ Header: () => null }));
vi.mock("../../components/footer", () => ({ default: () => null }));
vi.mock("../../components/admin-layout", () => ({ AdminLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("../../components/dialog", () => ({
  useAlert: () => ({ showAlert: vi.fn(), AlertUI: () => null }),
  useConfirm: () => ({ showConfirm: vi.fn(), ConfirmUI: () => null }),
}));
vi.mock("../../components/markdown", () => ({ Markdown: ({ content }: { content: string }) => <div>{content}</div> }));
vi.mock("../../components/adjacent_feed.tsx", () => ({ AdjacentSection: () => null }));
vi.mock("../../components/feed_card", () => ({ FeedCard: ({ title }: { title: string }) => <div>{title}</div> }));
vi.mock("../../components/page-templates", () => ({
  getPageTemplate: () => ({ render: ({ page }: { page: Page }) => <article>{page.content}</article> }),
}));

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
    vi.resetAllMocks();
    vi.mocked(client.feed.get).mockResolvedValue({ data: feed });
    vi.mocked(client.feed.list).mockResolvedValue({ data: { data: [], size: 0, hasNext: false } });
    vi.mocked(client.feed.unlock).mockResolvedValue({});
    vi.mocked(client.page.get).mockResolvedValue({ data: page });
    vi.mocked(client.page.list).mockResolvedValue({ data: [] });
    vi.mocked(client.page.unlock).mockResolvedValue({});
    vi.mocked(client.category.get).mockResolvedValue({ data: category });
    vi.mocked(client.search.search).mockResolvedValue({ data: { data: [{ ...feed, avatar: null, summary: "Article summary" }], size: 1, hasNext: false } });
    vi.mocked(client.comment.list).mockResolvedValue({ data: [] });
  });
  afterEach(cleanup);

  it.each(["/feed/101", "/article-slug"])("shares one article request between the body and hero at %s", async (path) => {
    openRoute(path);
    expect(await screen.findByText("Article body")).toBeInTheDocument();
    expect(await screen.findAllByRole("heading", { name: "Article title", level: 1 })).toHaveLength(2);
    expect(client.feed.get).toHaveBeenCalledTimes(1);
  });

  it("uses page data for the page hero without requesting a post", async () => {
    openRoute("/page/about");
    expect(await screen.findByText("About body")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "About page", level: 1 })).toBeInTheDocument();
    expect(client.page.get).toHaveBeenCalledTimes(1);
    expect(client.feed.get).not.toHaveBeenCalled();
    expect(isMiragesArticlePage("/page/about")).toBe(false);
  });

  it("uses category data and a list layout for category routes", async () => {
    openRoute("/category/tech");
    expect(await screen.findByRole("heading", { name: "Technology", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Tech notes")).toBeInTheDocument();
    expect(client.category.get).toHaveBeenCalledTimes(1);
    expect(client.feed.get).not.toHaveBeenCalled();
    expect(isMiragesListPage("/category/tech")).toBe(true);
    expect(isMiragesArticlePage("/category/tech")).toBe(false);
  });

  it("clears old hero data while navigating to an article that is still loading", async () => {
    const navigate = openRoute("/feed/101");
    await screen.findByText("Article body");
    let resolveNext!: (value: { data: Feed }) => void;
    vi.mocked(client.feed.get).mockImplementationOnce(() => new Promise((resolve) => { resolveNext = resolve; }));
    act(() => navigate("/feed/102"));
    expect(screen.queryByRole("heading", { name: "Article title", level: 1 })).not.toBeInTheDocument();
    await act(async () => resolveNext({ data: { ...feed, id: 102, title: "Next article", content: "Next body" } }));
    await waitFor(() => expect(screen.getAllByRole("heading", { name: "Next article", level: 1 })).toHaveLength(2));
    expect(client.feed.get).toHaveBeenCalledTimes(2);
  });

  it("renders search results with a search hero and list layout", async () => {
    openRoute("/search/article");
    expect(await screen.findByText("Article title")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "article.search.title$keyword", level: 1 })).toBeInTheDocument();
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
    vi.mocked(client[service].get).mockRejectedValueOnce(new Error("Content unavailable"));
    openRoute(path);
    expect(await screen.findByRole("heading", { name: "Content unavailable" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "error.title", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Article title", level: 1 })).not.toBeInTheDocument();
  });

  it.each([
    ["/feed/101", "Article body", "feed"],
    ["/page/about", "About body", "page"],
    ["/category/tech", "Tech notes", "category"],
  ] as const)("loads %s once in the app's StrictMode", async (path, text, service) => {
    openRoute(path, true);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(client[service].get).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["/feed/101", "feed", feed],
    ["/page/about", "page", page],
  ] as const)("shares the refreshed content after unlocking %s", async (path, service, content) => {
    if (service === "feed") {
      vi.mocked(client.feed.get).mockResolvedValueOnce({ data: { ...feed, content: "", locked: true } });
    } else {
      vi.mocked(client.page.get).mockResolvedValueOnce({ data: { ...page, content: "", locked: true } });
    }
    openRoute(path);
    await screen.findByText("password_required");
    expect(screen.queryByText(content.content)).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("password"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "unlock" }));
    expect(await screen.findByText(content.content)).toBeInTheDocument();
    expect(client[service].unlock).toHaveBeenCalledWith(content.id, "secret");
    expect(client[service].get).toHaveBeenCalledTimes(2);
    expect(client[service === "feed" ? "page" : "feed"].get).not.toHaveBeenCalled();
  });

  it("does not publish a late article response into a different page", async () => {
    let resolveArticle!: (value: { data: Feed }) => void;
    vi.mocked(client.feed.get).mockImplementationOnce(() => new Promise((resolve) => { resolveArticle = resolve; }));
    const navigate = openRoute("/feed/101");
    act(() => navigate("/page/about"));
    await screen.findByText("About body");
    await act(async () => resolveArticle({ data: feed }));
    expect(screen.getByRole("heading", { name: "About page" })).toBeInTheDocument();
    expect(screen.queryByText("Article title")).not.toBeInTheDocument();
    expect(screen.queryByText("Article body")).not.toBeInTheDocument();
  });

  it("clears category metadata and leaves loading when the next request fails", async () => {
    const navigate = openRoute("/category/tech");
    await screen.findByText("Tech notes");
    vi.mocked(client.category.get).mockRejectedValueOnce(new Error("Category unavailable"));
    act(() => navigate("/category/missing"));
    expect(await screen.findByRole("heading", { name: "Category unavailable" })).toBeInTheDocument();
    expect(screen.queryByText("Technology")).not.toBeInTheDocument();
    expect(screen.queryByText("Tech notes")).not.toBeInTheDocument();
  });

  it("restores the site hero when navigating home from an article", async () => {
    const navigate = openRoute("/feed/101");
    await screen.findByText("Article body");
    act(() => navigate("/"));
    expect(await screen.findByRole("heading", { name: "Test blog", level: 1 })).toBeInTheDocument();
    expect(screen.queryByText("Article title")).not.toBeInTheDocument();
    expect(client.feed.get).toHaveBeenCalledTimes(1);
  });
});
