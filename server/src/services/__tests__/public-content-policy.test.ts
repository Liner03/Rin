import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { cleanupTestDB, setupTestApp, type TestContext } from "../../../tests/fixtures";
import { CategoryService } from "../category";
import { CommentService } from "../comments";
import { FeedService, SearchService } from "../feed";
import { FriendService } from "../friends";
import { MomentsService } from "../moments";
import { PageService } from "../page";
import { TagService } from "../tag";

let ctx: TestContext;
const admin = { Authorization: "Bearer mock_token_1" };
function allServices() {
  const app = new Hono();
  app.route("/page", PageService());
  app.route("/friend", FriendService());
  app.route("/category", CategoryService());
  app.route("/tag", TagService());
  app.route("/moments", MomentsService());
  app.route("/search", SearchService());
  app.route("/comment", CommentService());
  app.route("/feed", FeedService());
  return app;
}
function get(path: string, headers: Record<string, string> = {}) {
  return ctx.app.request(path, { headers }, ctx.env);
}
function expectPolicy(response: Response, cacheable: boolean) {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("X-Rin-Content-Cache")).toBe(cacheable ? "public" : null);
}

beforeEach(async () => {
  ctx = await setupTestApp(allServices);
  await ctx.clientConfig.set("cache.enabled", true);
  ctx.sqlite.exec(`
    INSERT INTO users (id, username, permission, openid) VALUES (1, 'admin', 1, 'admin'), (2, 'reader', 0, 'reader');
    INSERT INTO contents (id, type, title, text, uid, slug, status, password, created_at) VALUES
      (1, 'post', 'Public article', 'Public body', 1, 'public', 'publish', '', 1700000000),
      (2, 'post', 'Draft article', 'Secret draft', 1, 'draft', 'draft', '', 1700000001),
      (3, 'post', 'Private article', 'Private body', 1, 'private', 'private', '', 1700000002),
      (4, 'post', 'Scheduled article', 'Future body', 1, 'scheduled', 'publish', '', 32472086400),
      (5, 'post', 'Protected article', 'Secret password body', 1, 'protected', 'publish', 'hash', 1700000004),
      (6, 'page', 'About', 'About body', 1, 'navigation', 'publish', '', 1700000000),
      (7, 'page', 'Draft page', 'Draft page body', 1, 'draft-page', 'draft', '', 1700000000),
      (8, 'page', 'Private page', 'Private page body', 1, 'private-page', 'private', '', 1700000000),
      (9, 'page', 'Scheduled page', 'Scheduled page body', 1, 'future-page', 'publish', '', 32472086400),
      (10, 'page', 'Protected page', 'Protected page body', 1, 'locked-page', 'publish', 'hash', 1700000000);
    INSERT INTO metas (id, type, name, slug) VALUES (1, 'category', 'Engineering', 'engineering'), (2, 'tag', 'Cache', 'cache');
    INSERT INTO relationships (content_id, meta_id) VALUES (1,1),(2,1),(3,1),(4,1),(1,2),(2,2),(3,2),(4,2);
    INSERT INTO friends (id, uid, name, url, avatar, accepted) VALUES
      (1, 1, 'Accepted', 'https://accepted.example', '', 1),
      (2, 2, 'Pending', 'https://pending.example', '', 0),
      (3, 2, 'Rejected', 'https://rejected.example', '', -1);
    INSERT INTO comments (id, content_id, content, approved, guest_email) VALUES
      (1, 1, 'Approved comment', 1, 'private@example.com'), (2, 1, 'Unapproved comment', 0, 'hidden@example.com'),
      (3, 2, 'Draft comment', 1, ''), (4, 3, 'Private comment', 1, ''),
      (5, 4, 'Future comment', 1, ''), (6, 5, 'Password comment', 1, '');
    INSERT INTO moments (content, uid) VALUES ('Public moment', 1);
  `);
});
afterEach(() => cleanupTestDB(ctx.sqlite));

describe("public content persistence policy", () => {
  it("projects navigation identically for every viewer without reserving the navigation page slug", async () => {
    for (const headers of [{}, admin]) {
      const response = await get("/page/navigation/list", headers);
      expectPolicy(response, true);
      const pages = await response.json() as { title: string; slug: string }[];
      expect(pages).toEqual([{ title: "About", slug: "navigation" }]);
    }
    const detail = await get("/page/navigation");
    expect(detail.status).toBe(200);
    expect((await detail.json() as { content: string }).content).toBe("About body");
  });

  it("separates public friends from authenticated application and moderation results", async () => {
    for (const headers of [{}, admin, { Authorization: "Bearer mock_token_2" }]) {
      const response = await get("/friend/public", headers);
      expectPolicy(response, true);
      const data = await response.json() as { friend_list: { name: string }[]; apply_list: unknown };
      expect(data.friend_list.map(friend => friend.name)).toEqual(["Accepted"]);
      expect(data.apply_list).toBeNull();
    }
    const moderation = await get("/friend", admin);
    expectPolicy(moderation, false);
    expect((await moderation.json() as { friend_list: unknown[] }).friend_list).toHaveLength(3);
    const personal = await get("/friend", { Authorization: "Bearer mock_token_2" });
    expectPolicy(personal, false);
    expect((await personal.json() as { apply_list: { name: string } }).apply_list.name).toBe("Pending");
  });

  it.each(["/category/engineering", "/tag/cache", "/search/article"])(
    "marks only public viewer results, including server cache hits, at %s", async path => {
      for (let visit = 0; visit < 2; visit++) {
        const response = await get(path);
        expectPolicy(response, true);
        const data = await response.json() as { data?: { title: string }[]; feeds?: { title: string }[] };
        expect((data.feeds ?? data.data ?? []).map(feed => feed.title)).toEqual(["Public article"]);
      }
      const response = await get(path, admin);
      expectPolicy(response, false);
    },
  );

  it.each(["/tag", "/moments", "/search/%20", "/feed/timeline"])(
    "marks public lists for anonymous and authenticated viewers at %s", async path => {
      for (const headers of [{}, admin]) {
        const response = await get(path, headers);
        expectPolicy(response, path !== "/search/%20" || headers !== admin);
        expect(response.status).toBe(200);
      }
    },
  );

  it("marks empty and populated moment responses including cache hits", async () => {
    for (let visit = 0; visit < 2; visit++) expectPolicy(await get("/moments"), true);
    ctx.sqlite.exec("DELETE FROM moments");
    await ctx.cache.clear();
    const response = await get("/moments");
    expectPolicy(response, true);
    expect((await response.json() as { data: unknown[] }).data).toEqual([]);
  });

  it("returns only approved comments without guest emails for public caching", async () => {
    for (const headers of [{}, admin]) {
      const response = await get("/comment/1", headers);
      expectPolicy(response, true);
      const data = await response.json() as { content: string }[];
      expect(data.map(comment => comment.content)).toEqual(["Approved comment"]);
      expect(JSON.stringify(data)).not.toContain("Email");
      expect(JSON.stringify(data)).not.toContain("@example.com");
    }
  });

  it.each([2, 3, 4, 5])("checks the parent before returning comments or adjacent links for %s", async id => {
    for (const path of [`/comment/${id}`, `/feed/adjacent/${id}`]) {
      const response = await get(path);
      expect(response.status).toBe(403);
      expectPolicy(response, false);
      const privileged = await get(path, admin);
      expect(privileged.status).toBe(200);
      expectPolicy(privileged, false);
    }
  });

  it.each(["/category/missing", "/tag/missing", "/comment/999", "/feed/adjacent/999"])(
    "does not mark missing resources at %s", async path => {
      const response = await get(path);
      expect(response.status).toBe(404);
      expectPolicy(response, false);
    },
  );

  it("does not derive adjacent summaries from protected bodies", async () => {
    const response = await get("/feed/adjacent/1");
    expectPolicy(response, true);
    const data = await response.json() as { nextFeed: { title: string; summary: string } };
    expect(data.nextFeed.title).toBe("Protected article");
    expect(data.nextFeed.summary).toBe("");
  });

  it("invalidates cached adjacent links after a new intervening article is created", async () => {
    const before = await get("/feed/adjacent/1");
    expect((await before.json() as { nextFeed: { id: number } }).nextFeed.id).toBe(5);
    const created = await ctx.app.request("/feed", {
      method: "POST", headers: { ...admin, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Intervening", content: "New body", draft: false, listed: true, tags: [] }),
    }, ctx.env);
    expect(created.status).toBe(200);
    const { insertedId } = await created.json() as { insertedId: number };
    ctx.sqlite.run("UPDATE contents SET created_at = ? WHERE id = ?", [1700000001, insertedId]);
    const after = await get("/feed/adjacent/1");
    expectPolicy(after, true);
    expect((await after.json() as { nextFeed: { id: number } }).nextFeed.id).toBe(insertedId);
  });
});
