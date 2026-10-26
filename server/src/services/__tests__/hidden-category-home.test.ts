import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { cleanupTestDB, setupTestApp, type TestContext } from "../../../tests/fixtures";
import { CategoryService } from "../category";
import { FeedService } from "../feed";

let ctx: TestContext;
const ADMIN_HEADERS = { Authorization: "Bearer mock_token_1", "Content-Type": "application/json" };

beforeEach(async () => {
  ctx = await setupTestApp(() => {
    const app = new Hono();
    app.route("/feed", FeedService());
    app.route("/category", CategoryService());
    return app;
  });
  await ctx.clientConfig.set("cache.enabled", true);
  await ctx.clientConfig.set("counter.enabled", false);
  ctx.sqlite.exec(`
    INSERT INTO users (id, username, openid, permission) VALUES
      (1, 'admin', 'admin', 1), (2, 'reader', 'reader', 0);
    INSERT INTO metas (id, type, name, slug, listed) VALUES
      (1, 'category', 'Home hidden', 'home-hidden', 0),
      (2, 'category', 'Visible', 'visible', 1),
      (3, 'tag', 'Tag', 'tag', 0);
    INSERT INTO contents (id, title, slug, text, uid, top, status, created_at) VALUES
      (140, 'Hidden category article', 'hidden-category', 'Article body', 1, 10, 'publish', 1700000000),
      (141, 'Visible article', 'visible-article', 'Article body', 1, 8, 'publish', 1700000000),
      (142, 'Both categories', 'both-categories', 'Article body', 1, 9, 'publish', 1700000000),
      (143, 'Unclassified', 'unclassified', 'Article body', 1, 7, 'publish', 1700000000),
      (144, 'Tag only', 'tag-only', 'Article body', 1, 6, 'publish', 1700000000),
      (145, 'Draft', 'draft', 'Article body', 1, 5, 'draft', 1700000000),
      (146, 'Unlisted', 'unlisted', 'Article body', 1, 4, 'hidden', 1700000000);
    INSERT INTO relationships (content_id, meta_id) VALUES
      (140, 1), (141, 2), (142, 1), (142, 2), (144, 3), (145, 1), (146, 1);
  `);
});

afterEach(() => cleanupTestDB(ctx.sqlite));

type List = { size: number; hasNext: boolean; data: { id: number }[] };
async function home(path = "/feed?type=normal", headers: Record<string, string> = {}) {
  const response = await ctx.app.request(path, { headers }, ctx.env);
  expect(response.status).toBe(200);
  return response.json() as Promise<List>;
}

describe("Typecho home-hidden categories", () => {
  it.each(["guest", "reader", "admin"])("keeps hidden categories off the homepage for %s, with correct counts and pagination", async viewer => {
    const headers: Record<string, string> = viewer === "guest" ? {}
      : { Authorization: `Bearer mock_token_${viewer === "admin" ? 1 : 2}` };
    for (let visit = 0; visit < 2; visit++) {
      const first = await home("/feed?type=normal&page=1&limit=2", headers);
      expect(first.size).toBe(3);
      expect(first.data.map(row => row.id)).toEqual([141, 143]);
      expect(first.hasNext).toBe(true);
      const second = await home("/feed?type=normal&page=2&limit=2", headers);
      expect(second.size).toBe(3);
      expect(second.data.map(row => row.id)).toEqual([144]);
      expect(second.hasNext).toBe(false);
    }
  });

  it.each(["/feed", "/feed?type=", "/feed?type=normal"])("applies the same admin homepage visibility at %s", async path => {
    const result = await home(path, ADMIN_HEADERS);
    expect(result.data.map(row => row.id)).toEqual([141, 143, 144]);
  });

  it("ignores lists cached before the admin homepage visibility fix", async () => {
    await ctx.cache.set("feeds_admin_normal_0_20", {
      t: Date.now(), data: { size: 1, hasNext: false, data: [{ id: 140 }] },
    });
    const result = await home("/feed?type=normal", ADMIN_HEADERS);
    expect(result.size).toBe(3);
    expect(result.data.map(row => row.id)).toEqual([141, 143, 144]);
  });

  it.each(["guest", "admin"])("keeps hidden-category articles available in archives and by direct link for %s", async viewer => {
    const headers = new Headers();
    if (viewer === "admin") headers.set("Authorization", "Bearer mock_token_1");
    const timeline = await ctx.app.request("/feed/timeline", { headers }, ctx.env);
    expect(timeline.status).toBe(200);
    const rows = await timeline.json() as { id: number }[];
    expect(rows.map(row => row.id).sort()).toEqual([140, 141, 142, 143, 144]);
    const article = await ctx.app.request("/feed/140", { headers }, ctx.env);
    expect(article.status).toBe(200);
    expect((await article.json() as { content: string }).content).toBe("Article body");
  });

  it.each(["draft", "unlisted"])("keeps the admin's explicit %s management list accessible", async type => {
    const result = await home(`/feed?type=${type}`, ADMIN_HEADERS);
    expect(result.data.map(row => row.id)).toEqual([type === "draft" ? 145 : 146]);
    const denied = await ctx.app.request(`/feed?type=${type}`, {}, ctx.env);
    expect(denied.status).toBe(403);
  });

  it("immediately refreshes both visitor and admin homepage caches after hiding or restoring a category", async () => {
    for (const listed of [true, false, true]) {
      const updated = await ctx.app.request("/category/1", {
        method: "PUT", headers: ADMIN_HEADERS, body: JSON.stringify({ listed }),
      }, ctx.env);
      expect(updated.status).toBe(200);
      for (const headers of [{}, ADMIN_HEADERS]) {
        const result = await home("/feed?type=normal", headers);
        expect(result.size).toBe(listed ? 5 : 3);
        expect(result.data.map(row => row.id)).toEqual(listed ? [140, 142, 141, 143, 144] : [141, 143, 144]);
      }
    }
  });

  it("refreshes cached homepages when deleting a hidden category makes its articles listed again", async () => {
    for (const headers of [{}, ADMIN_HEADERS]) {
      expect((await home("/feed?type=normal", headers)).size).toBe(3);
    }
    const deleted = await ctx.app.request("/category/1", { method: "DELETE", headers: ADMIN_HEADERS }, ctx.env);
    expect(deleted.status).toBe(200);
    for (const headers of [{}, ADMIN_HEADERS]) {
      const result = await home("/feed?type=normal", headers);
      expect(result.size).toBe(5);
      expect(result.data.map(row => row.id)).toEqual([140, 142, 141, 143, 144]);
    }
  });
});
