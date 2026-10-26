import { describe, expect, it, spyOn } from "bun:test";
import { Hono } from "hono";
import { CategoryService } from "../category";
import { FeedService, WordPressService } from "../feed";
import { FriendService } from "../friends";
import { MomentsService } from "../moments";
import { PageService } from "../page";
import { SitemapService, sitemapCrontab } from "../sitemap";
import { cleanupTestDB, createMockEnv, setupTestApp } from "../../../tests/fixtures";

function createSitemapStorage() {
  const objects = new Map<string, { body: string; uploaded: Date }>();
  const writes: string[] = [];
  const hooks: { beforePut?: () => Promise<void> } = {};
  const env = createMockEnv({
    FRONTEND_URL: "https://canonical.example",
    R2_BUCKET: {
      get: async (key: string) => {
        const object = objects.get(key);
        return object ? {
          body: new Blob([object.body]).stream(),
          size: new TextEncoder().encode(object.body).length,
          uploaded: object.uploaded,
          writeHttpMetadata() {},
        } : null;
      },
      put: async (key: string, body: string) => {
        await hooks.beforePut?.();
        objects.set(key, { body, uploaded: new Date() });
        writes.push(key);
        return null;
      },
    } as unknown as R2Bucket,
  });
  return { env, objects, writes, hooks };
}

function sitemapTestApp() {
  const app = new Hono();
  app.route("/feed", FeedService());
  app.route("/page", PageService());
  app.route("/category", CategoryService());
  app.route("/moments", MomentsService());
  app.route("/friend", FriendService());
  app.route("/wp", WordPressService());
  app.route("/", SitemapService());
  return app;
}

const ADMIN_HEADERS = { Authorization: "Bearer mock_token_1", "Content-Type": "application/json" };

describe("SitemapService", () => {
  it.each([
    ["post creation", "POST", "/feed", { title: "New post", content: "New content", slug: "new", draft: false, listed: true, tags: [] }],
    ["post editing", "POST", "/feed/1", { slug: "renamed" }],
    ["post deletion", "DELETE", "/feed/1", undefined],
    ["page creation", "POST", "/page", { title: "New page", content: "Content", slug: "new-page" }],
    ["page editing", "POST", "/page/2", { slug: "renamed-page" }],
    ["page deletion", "DELETE", "/page/2", undefined],
    ["category creation", "POST", "/category", { name: "New category", slug: "new-category" }],
    ["category editing", "PUT", "/category/1", { listed: false }],
    ["category deletion", "DELETE", "/category/1", undefined],
    ["moment creation", "POST", "/moments", { content: "New moment" }],
    ["moment editing", "POST", "/moments/1", { content: "Edited moment" }],
    ["moment deletion", "DELETE", "/moments/1", undefined],
    ["friend creation", "POST", "/friend", { name: "New friend", desc: "Friend", avatar: "https://example.com/a.png", url: "https://example.com" }],
    ["friend editing", "PUT", "/friend/1", { name: "Edited friend" }],
    ["friend deletion", "DELETE", "/friend/1", undefined],
  ] as const)("rolls back %s when the sitemap revision cannot be persisted", async (_name, method, path, body) => {
    const storage = createSitemapStorage();
    const ctx = await setupTestApp(sitemapTestApp, storage.env);
    const expectedError = spyOn(console, "error").mockImplementation(() => {});
    try {
      ctx.sqlite.exec(`
        INSERT INTO users (id, username, openid, permission) VALUES (1, 'admin', 'gh_admin', 1);
        INSERT INTO contents (id, type, title, slug, uid, updated_at) VALUES
          (1, 'post', 'Post', 'old-slug', 1, 1700000000),
          (2, 'page', 'Page', 'page', 1, 1700000000);
        INSERT INTO metas (id, type, name, slug, updated_at) VALUES (1, 'category', 'Category', 'category', 1700000000);
        INSERT INTO relationships (content_id, meta_id) VALUES (1, 1);
        INSERT INTO moments (id, content, uid, updated_at) VALUES (1, 'Moment', 1, 1700000000);
        INSERT INTO friends (id, name, desc, avatar, url, uid, accepted, updated_at)
          VALUES (1, 'Friend', 'Description', 'https://example.com/a.png', 'https://example.com', 1, 1, 1700000000);
      `);
      const snapshot = () => ["contents", "metas", "relationships", "moments", "friends"].map((table) =>
        ctx.sqlite.query(`SELECT * FROM ${table} ORDER BY 1, 2`).all());
      const before = snapshot();
      const initial = await (await ctx.app.request("/sitemap.xml", {}, storage.env)).text();
      ctx.sqlite.exec(`CREATE TRIGGER fail_sitemap_revision BEFORE INSERT ON cache WHEN NEW.type = 'sitemap'
        BEGIN SELECT RAISE(ABORT, 'temporary revision write failure'); END`);

      const response = await ctx.app.request(path, {
        method, headers: ADMIN_HEADERS, body: body ? JSON.stringify(body) : undefined,
      }, storage.env);
      expect(response.status).toBe(500);
      ctx.sqlite.exec("DROP TRIGGER fail_sitemap_revision");
      expect(snapshot()).toEqual(before);
      for (let attempt = 0; attempt < 3; attempt++) {
        expect(await (await ctx.app.request("/sitemap.xml", {}, storage.env)).text()).toBe(initial);
      }
      await sitemapCrontab(storage.env, ctx.db);
      expect(await (await ctx.app.request("/sitemap.xml", {}, storage.env)).text()).toBe(initial);
      expect(storage.writes.filter((key) => key === "cache/sitemap-v2.json")).toHaveLength(1);
    } finally {
      expectedError.mockRestore();
      cleanupTestDB(ctx.sqlite);
    }
  });

  it("invalidates a cached sitemap after publishing, editing, protecting, hiding, and deleting a post", async () => {
    const storage = createSitemapStorage();
    const ctx = await setupTestApp(sitemapTestApp, storage.env);
    try {
      ctx.sqlite.exec(`INSERT INTO users (id, username, openid, permission) VALUES (1, 'admin', 'gh_admin', 1)`);
      const sitemap = async () => {
        const response = await ctx.app.request("/sitemap.xml", {}, storage.env);
        expect(response.status).toBe(200);
        return response.text();
      };
      const write = async (path: string, body?: object, method = "POST") => {
        const response = await ctx.app.request(path, {
          method,
          headers: { Authorization: "Bearer mock_token_1", "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        }, storage.env);
        expect(response.status).toBe(200);
      };

      await sitemap();
      await write("/feed", { title: "Published", content: "Content", slug: "published", createdAt: "2020-01-01T00:00:00Z", draft: false, listed: true, tags: ["first-tag"] });
      const published = await sitemap();
      expect(published).toContain("<loc>https://canonical.example/published</loc>");
      expect(published).toContain("/hashtag/first-tag</loc>");
      const writeCount = storage.writes.length;
      await sitemap();
      expect(storage.writes).toHaveLength(writeCount);

      await write("/feed/1", { slug: "renamed", tags: ["second-tag"] });
      const renamed = await sitemap();
      expect(renamed).toContain("<loc>https://canonical.example/renamed</loc>");
      expect(renamed).not.toContain("<loc>https://canonical.example/published</loc>");
      expect(renamed).toContain("/hashtag/second-tag</loc>");
      expect(renamed).not.toContain("/hashtag/first-tag</loc>");

      await write("/feed/1", { password: "secret" });
      expect(await sitemap()).not.toContain("<loc>https://canonical.example/renamed</loc>");
      await write("/feed/1", { password: "", status: "publish" });
      expect(await sitemap()).toContain("<loc>https://canonical.example/renamed</loc>");
      await write("/feed/1", { status: "hidden" });
      expect(await sitemap()).not.toContain("<loc>https://canonical.example/renamed</loc>");
      await write("/feed/1", { status: "publish" });
      expect(await sitemap()).toContain("<loc>https://canonical.example/renamed</loc>");
      for (const status of ["draft", "private"]) {
        await write("/feed/1", { status });
        expect(await sitemap()).not.toContain("<loc>https://canonical.example/renamed</loc>");
        await write("/feed/1", { status: "publish" });
        expect(await sitemap()).toContain("<loc>https://canonical.example/renamed</loc>");
      }
      await write("/feed/1", undefined, "DELETE");
      expect(await sitemap()).not.toContain("<loc>https://canonical.example/renamed</loc>");
    } finally {
      cleanupTestDB(ctx.sqlite);
    }
  });

  it("invalidates cached page URLs after create, rename, and delete", async () => {
    const storage = createSitemapStorage();
    const ctx = await setupTestApp(sitemapTestApp, storage.env);
    try {
      ctx.sqlite.exec(`INSERT INTO users (id, username, openid, permission) VALUES (1, 'admin', 'gh_admin', 1)`);
      const sitemap = async () => (await ctx.app.request("/sitemap.xml", {}, storage.env)).text();
      await sitemap();
      const created = await ctx.app.request("/page", {
        method: "POST", headers: ADMIN_HEADERS,
        body: JSON.stringify({ title: "About", content: "About us", slug: "about" }),
      }, storage.env);
      expect(created.status).toBe(200);
      expect(await sitemap()).toContain("/page/about</loc>");
      const renamed = await ctx.app.request("/page/1", {
        method: "POST", headers: ADMIN_HEADERS, body: JSON.stringify({ slug: "about-us" }),
      }, storage.env);
      expect(renamed.status).toBe(200);
      const xml = await sitemap();
      expect(xml).toContain("/page/about-us</loc>");
      expect(xml).not.toContain("/page/about</loc>");
      expect((await ctx.app.request("/page/1", { method: "DELETE", headers: ADMIN_HEADERS }, storage.env)).status).toBe(200);
      expect(await sitemap()).not.toContain("/page/about-us</loc>");
    } finally {
      cleanupTestDB(ctx.sqlite);
    }
  });

  it("invalidates article and taxonomy URLs when a category is renamed, hidden, restored, or deleted", async () => {
    const storage = createSitemapStorage();
    const ctx = await setupTestApp(sitemapTestApp, storage.env);
    try {
      ctx.sqlite.exec(`
        INSERT INTO users (id, username, openid, permission) VALUES (1, 'admin', 'gh_admin', 1);
        INSERT INTO contents (id, title, slug, uid) VALUES (1, 'Post', 'published', 1);
        INSERT INTO metas (id, type, name, slug) VALUES (1, 'category', 'Category', 'category');
        INSERT INTO relationships (content_id, meta_id) VALUES (1, 1);
      `);
      const sitemap = async () => (await ctx.app.request("/sitemap.xml", {}, storage.env)).text();
      expect(await sitemap()).toContain("/category/category</loc>");
      for (const body of [{ slug: "renamed" }, { listed: false }, { listed: true }]) {
        const response = await ctx.app.request("/category/1", {
          method: "PUT", headers: ADMIN_HEADERS, body: JSON.stringify(body),
        }, storage.env);
        expect(response.status).toBe(200);
        const xml = await sitemap();
        if (body.listed === false) {
          expect(xml).not.toContain("/published</loc>");
          expect(xml).not.toContain("/category/renamed</loc>");
        } else {
          expect(xml).toContain("/published</loc>");
          expect(xml).toContain("/category/renamed</loc>");
          expect(xml).not.toContain("/category/category</loc>");
        }
      }
      expect((await ctx.app.request("/category/1", { method: "DELETE", headers: ADMIN_HEADERS }, storage.env)).status).toBe(200);
      const xml = await sitemap();
      expect(xml).toContain("/published</loc>");
      expect(xml).not.toContain("/category/renamed</loc>");
    } finally {
      cleanupTestDB(ctx.sqlite);
    }
  });

  it.each(["moments", "friend"])("refreshes aggregate lastmod after %s creation, editing, and deletion", async (service) => {
    const storage = createSitemapStorage();
    const ctx = await setupTestApp(sitemapTestApp, storage.env);
    try {
      ctx.sqlite.exec(`INSERT INTO users (id, username, openid, permission) VALUES (1, 'admin', 'gh_admin', 1)`);
      const sitemap = async () => (await ctx.app.request("/sitemap.xml", {}, storage.env)).text();
      const initial = await sitemap();
      const body = service === "moments" ? { content: "A moment" }
        : { name: "Friend", desc: "A friend", avatar: "https://example.com/avatar.png", url: "https://example.com" };
      const created = await ctx.app.request(`/${service}`, {
        method: "POST", headers: ADMIN_HEADERS, body: JSON.stringify(body),
      }, storage.env);
      expect(created.status).toBe(200);
      const changed = await sitemap();
      expect(changed).not.toBe(initial);
      expect(changed).toContain("<lastmod>");
      const updated = await ctx.app.request(`/${service}/1`, {
        method: service === "moments" ? "POST" : "PUT", headers: ADMIN_HEADERS,
        body: JSON.stringify(service === "moments" ? { content: "Edited" } : { name: "Edited" }),
      }, storage.env);
      expect(updated.status).toBe(200);
      await sitemap();
      expect(storage.writes).toHaveLength(3);
      expect((await ctx.app.request(`/${service}/1`, { method: "DELETE", headers: ADMIN_HEADERS }, storage.env)).status).toBe(200);
      expect(await sitemap()).toBe(initial);
      expect(storage.writes).toHaveLength(4);
    } finally {
      cleanupTestDB(ctx.sqlite);
    }
  });

  it("keeps the cache after unauthorized or invalid write requests", async () => {
    const storage = createSitemapStorage();
    const ctx = await setupTestApp(sitemapTestApp, storage.env);
    try {
      ctx.sqlite.exec(`INSERT INTO users (id, username, openid, permission) VALUES (1, 'admin', 'gh_admin', 1)`);
      await ctx.app.request("/sitemap.xml", {}, storage.env);
      expect((await ctx.app.request("/feed", { method: "POST" }, storage.env)).status).toBe(403);
      expect((await ctx.app.request("/feed", { method: "POST", headers: ADMIN_HEADERS, body: "{}" }, storage.env)).status).toBe(400);
      await ctx.app.request("/sitemap.xml", {}, storage.env);
      expect(storage.writes).toHaveLength(1);
    } finally {
      cleanupTestDB(ctx.sqlite);
    }
  });

  it.each(["create", "edit"])("invalidates committed content when tag binding fails during %s", async (operation) => {
    const storage = createSitemapStorage();
    const ctx = await setupTestApp(sitemapTestApp, storage.env);
    const expectedError = spyOn(console, "error").mockImplementation(() => {});
    try {
      ctx.sqlite.exec(`INSERT INTO users (id, username, openid, permission) VALUES (1, 'admin', 'gh_admin', 1)`);
      if (operation === "edit") {
        ctx.sqlite.exec(`INSERT INTO contents (id, title, slug, uid) VALUES (1, 'Post', 'old-slug', 1)`);
      }
      await ctx.app.request("/sitemap.xml", {}, storage.env);
      ctx.sqlite.exec(`CREATE TRIGGER reject_tags BEFORE INSERT ON metas BEGIN SELECT RAISE(ABORT, 'rejected'); END`);
      const response = await ctx.app.request(operation === "create" ? "/feed" : "/feed/1", {
        method: "POST", headers: ADMIN_HEADERS,
        body: JSON.stringify({ title: "Post", content: "Content", slug: "new-slug", draft: false, listed: true, tags: ["blocked"] }),
      }, storage.env);
      expect(response.status).toBe(500);
      const sitemap = await ctx.app.request("/sitemap.xml", {}, storage.env);
      const xml = await sitemap.text();
      expect(xml).toContain("/new-slug</loc>");
      expect(xml).not.toContain("/old-slug</loc>");
    } finally {
      expectedError.mockRestore();
      cleanupTestDB(ctx.sqlite);
    }
  });

  it("expires the cache at the next scheduled publication without another write request", async () => {
    const storage = createSitemapStorage();
    const ctx = await setupTestApp(SitemapService, storage.env);
    const now = Date.now();
    const clock = spyOn(Date, "now").mockReturnValue(now);
    try {
      const publishAt = Math.floor(now / 1000) + 3600;
      ctx.sqlite.exec(`
        INSERT INTO users (id, username, openid) VALUES (1, 'testuser', 'gh_test');
        INSERT INTO contents (id, title, slug, uid, created_at) VALUES (1, 'Scheduled', 'scheduled', 1, ${publishAt});
        INSERT INTO contents (id, title, slug, uid, password, created_at) VALUES (2, 'Protected', 'protected', 1, 'hash', ${publishAt - 1800});
      `);
      const before = await ctx.app.request("/sitemap.xml", {}, storage.env);
      expect(await before.text()).not.toContain("/scheduled</loc>");
      const cached = JSON.parse(storage.objects.get("cache/sitemap-v2.json")!.body);
      expect(cached.expiresAt).toBe(publishAt * 1000);

      clock.mockReturnValue(publishAt * 1000);
      const after = await ctx.app.request("/sitemap.xml", {}, storage.env);
      const xml = await after.text();
      expect(xml).toContain("/scheduled</loc>");
      expect(xml).not.toContain("/protected</loc>");
      expect(storage.writes).toHaveLength(2);
    } finally {
      clock.mockRestore();
      cleanupTestDB(ctx.sqlite);
    }
  });

  it("rejects a stale cache written by an in-flight generation after a content change", async () => {
    const storage = createSitemapStorage();
    const ctx = await setupTestApp(sitemapTestApp, storage.env);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const putStarted = new Promise<void>((resolve) => { started = resolve; });
    let paused = false;
    storage.hooks.beforePut = async () => {
      if (paused) return;
      paused = true;
      started();
      await gate;
    };
    let first: Promise<Response> | undefined;
    try {
      ctx.sqlite.exec(`
        INSERT INTO users (id, username, openid, permission) VALUES (1, 'admin', 'gh_admin', 1);
        INSERT INTO contents (id, title, slug, uid) VALUES (1, 'Post', 'old-slug', 1);
      `);
      first = Promise.resolve(ctx.app.request("/sitemap.xml", {}, storage.env));
      await putStarted;
      const updated = await ctx.app.request("/feed/1", {
        method: "POST", headers: ADMIN_HEADERS, body: JSON.stringify({ slug: "new-slug" }),
      }, storage.env);
      expect(updated.status).toBe(200);
      const fresh = await ctx.app.request("/sitemap.xml", {}, storage.env);
      expect(await fresh.text()).toContain("/new-slug</loc>");
      release();
      expect(await (await first).text()).toContain("/old-slug</loc>");

      const next = await ctx.app.request("/sitemap.xml", {}, storage.env);
      const xml = await next.text();
      expect(xml).toContain("/new-slug</loc>");
      expect(xml).not.toContain("/old-slug</loc>");
      expect(storage.writes).toHaveLength(3);
    } finally {
      release();
      await first;
      cleanupTestDB(ctx.sqlite);
    }
  });

  it.each([false, true])("invalidates the cache after a WordPress import, including partial failure (%s)", async (failSecond) => {
    const storage = createSitemapStorage();
    const ctx = await setupTestApp(sitemapTestApp, storage.env);
    const expectedError = failSecond ? spyOn(console, "error").mockImplementation(() => {}) : undefined;
    try {
      ctx.sqlite.exec(`INSERT INTO users (id, username, openid, permission) VALUES (1, 'admin', 'gh_admin', 1)`);
      await ctx.app.request("/sitemap.xml", {}, storage.env);
      if (failSecond) {
        ctx.sqlite.exec(`CREATE TRIGGER reject_second BEFORE INSERT ON contents WHEN NEW.title = 'Second'
          BEGIN SELECT RAISE(ABORT, 'rejected'); END`);
      }
      const item = (title: string) => `<item><title>${title}</title><wp:post_date>2020-01-01</wp:post_date><wp:post_modified>2020-01-01</wp:post_modified><wp:status>publish</wp:status><content:encoded><![CDATA[<p>${title} content</p>]]></content:encoded></item>`;
      const form = new FormData();
      form.set("data", new File([`<rss><channel>${item("First")}${item("Second")}</channel></rss>`], "import.xml", { type: "application/xml" }));
      const response = await ctx.app.request("/wp", {
        method: "POST", headers: { Authorization: "Bearer mock_token_1" }, body: form,
      }, storage.env);
      expect(response.status).toBe(failSecond ? 500 : 200);
      const sitemap = await ctx.app.request("/sitemap.xml", {}, storage.env);
      const xml = await sitemap.text();
      expect(xml).toContain("/first</loc>");
      if (failSecond) expect(xml).not.toContain("/second</loc>");
      else expect(xml).toContain("/second</loc>");
    } finally {
      expectedError?.mockRestore();
      cleanupTestDB(ctx.sqlite);
    }
  });

  it.each(["expired", "future-dated", "undated", "wrong-revision", "wrong-origin", "malformed", "legacy"])(
    "regenerates %s persistent caches so articles are included", async (state) => {
      const storage = createSitemapStorage();
      const ctx = await setupTestApp(SitemapService, storage.env);
      try {
        ctx.sqlite.exec(`INSERT INTO users (id, username, openid) VALUES (1, 'testuser', 'gh_test')`);
        ctx.sqlite.exec(`INSERT INTO contents (id, slug, title, text, uid, status) VALUES (1, 'published', 'Published', 'Content', 1, 'publish')`);
        await ctx.app.request("/sitemap.xml", {}, storage.env);
        const key = "cache/sitemap-v2.json";
        const object = storage.objects.get(key)!;
        const cached = JSON.parse(object.body);
        cached.xml = '<?xml version="1.0"?><urlset></urlset>';
        if (state === "expired") {
          cached.generatedAt = Date.now() - 31 * 24 * 60 * 60 * 1000;
          cached.expiresAt = cached.generatedAt + 30 * 24 * 60 * 60 * 1000;
        } else if (state === "future-dated") {
          cached.generatedAt = Date.now() + 60 * 60 * 1000;
        } else if (state === "undated") {
          delete cached.expiresAt;
        } else if (state === "wrong-revision") {
          cached.revision = "an-obsolete-revision";
        } else if (state === "wrong-origin") {
          cached.baseUrl = "https://old.example";
        }
        object.body = state === "malformed" ? "invalid JSON"
          : state === "legacy" ? cached.xml : JSON.stringify(cached);
        const response = await ctx.app.request("/sitemap.xml", {}, storage.env);
        expect(response.status).toBe(200);
        expect(await response.text()).toContain("<loc>https://canonical.example/published</loc>");
        expect(storage.writes).toEqual([key, key]);
      } finally {
        cleanupTestDB(ctx.sqlite);
      }
    },
  );

  it("reuses an unchanged cache for 30 days and requires HTTP revalidation", async () => {
    const storage = createSitemapStorage();
    const ctx = await setupTestApp(SitemapService, storage.env);
    try {
      const initial = await ctx.app.request("/sitemap.xml", {}, storage.env);
      const xml = await initial.text();
      const key = "cache/sitemap-v2.json";
      const object = storage.objects.get(key)!;
      const cached = JSON.parse(object.body);
      expect(cached.expiresAt - cached.generatedAt).toBe(30 * 24 * 60 * 60 * 1000);
      cached.generatedAt = Date.now() - 29 * 24 * 60 * 60 * 1000;
      cached.expiresAt = cached.generatedAt + 30 * 24 * 60 * 60 * 1000;
      object.body = JSON.stringify(cached);

      const response = await ctx.app.request("/sitemap.xml", {}, storage.env);
      expect(await response.text()).toBe(xml);
      expect(response.headers.get("Cache-Control")).toBe("public, no-cache");
      expect(storage.writes).toEqual([key]);
    } finally {
      cleanupTestDB(ctx.sqlite);
    }
  });

  it("uses the request origin, bypasses shared storage, and only exposes public posts and independent pages", async () => {
    let getCalls = 0;
    let putCalls = 0;
    const env = createMockEnv({
      R2_BUCKET: {
        get: async () => {
          getCalls += 1;
          return null;
        },
        put: async () => {
          putCalls += 1;
          return null;
        },
      } as unknown as R2Bucket,
    });
    const requestCtx = await setupTestApp(SitemapService, env);
    requestCtx.sqlite.exec(`INSERT INTO users (id, username, openid) VALUES (1, 'testuser', 'gh_test')`);
    requestCtx.sqlite.exec(`
      INSERT INTO contents (id, slug, title, text, uid, type, status, password, created_at) VALUES
        (1, 'published', 'Published', 'Content', 1, 'post', 'publish', '', 1700000000),
        (2, 'unlisted', 'Unlisted', 'Content', 1, 'post', 'hidden', '', 1700000000),
        (3, 'about', 'About', 'Content', 1, 'page', 'publish', '', 1700000000),
        (4, 'about-draft', 'Draft About', 'Content', 1, 'page', 'draft', '', 1700000000),
        (5, 'protected', 'Protected', 'Content', 1, 'post', 'publish', 'hash', 1700000000),
        (6, 'scheduled', 'Scheduled', 'Content', 1, 'post', 'publish', '', 32503680000),
        (7, 'hidden-category', 'Hidden category', 'Content', 1, 'post', 'publish', '', 1700000000),
        (8, 'private', 'Private', 'Content', 1, 'post', 'private', '', 1700000000),
        (9, 'protected-page', 'Protected page', 'Content', 1, 'page', 'publish', 'hash', 1700000000)
    `);
    requestCtx.sqlite.exec(`
      INSERT INTO metas (id, type, name, slug, listed) VALUES
        (1, 'tag', 'public-tag', 'public-tag', 1),
        (2, 'tag', 'unlisted-tag', 'unlisted-tag', 1),
        (3, 'tag', 'about-tag', 'about-tag', 1),
        (4, 'tag', 'draft-tag', 'draft-tag', 1),
        (5, 'category', 'Technology', 'tech', 1),
        (6, 'category', 'Hidden', 'hidden', 0)
    `);
    requestCtx.sqlite.exec(`
      INSERT INTO relationships (content_id, meta_id) VALUES
        (1, 1), (2, 2), (3, 3), (4, 4), (1, 5), (7, 6)
    `);

    const sitemap = await requestCtx.app.request("https://blog.example/sitemap.xml", { method: "GET" }, env);
    const xml = await sitemap.text();
    expect(xml).toContain("https://blog.example/published");
    expect(xml).toContain("https://blog.example/page/about");
    expect(xml).not.toContain("https://blog.example/unlisted");
    expect(xml).not.toContain("https://blog.example/page/about-draft");
    expect(xml).toContain("https://blog.example/hashtag/public-tag");
    expect(xml).not.toContain("https://blog.example/hashtag/about-tag");
    expect(xml).toContain("https://blog.example/category/tech");
    for (const slug of ["protected", "scheduled", "hidden-category", "private", "category/hidden", "page/protected-page"]) {
      expect(xml).not.toContain(`https://blog.example/${slug}<`);
    }
    expect(xml).not.toContain("https://blog.example/hashtag/unlisted-tag");
    expect(xml).not.toContain("https://blog.example/hashtag/draft-tag");
    expect(getCalls).toBe(0);
    expect(putCalls).toBe(0);

    const robots = await requestCtx.app.request("https://blog.example/robots.txt", { method: "GET" }, env);
    expect(await robots.text()).toContain("Sitemap: https://blog.example/sitemap.xml");
    expect(getCalls).toBe(0);
    expect(putCalls).toBe(0);

    cleanupTestDB(requestCtx.sqlite);
  });

  it("uses FRONTEND_URL for canonical URLs and persistent storage", async () => {
    const keys: string[] = [];
    const env = createMockEnv({
      FRONTEND_URL: "https://canonical.example/",
      R2_BUCKET: {
        get: async () => null,
        put: async (key: string) => {
          keys.push(key);
          return null;
        },
      } as unknown as R2Bucket,
    });
    const ctx = await setupTestApp(SitemapService, env);
    ctx.sqlite.exec(`INSERT INTO users (id, username, openid) VALUES (1, 'testuser', 'gh_test')`);
    ctx.sqlite.exec(`INSERT INTO contents (id, title, text, uid, status) VALUES (1, 'Published', 'Content', 1, 'publish')`);

    const sitemap = await ctx.app.request("https://other.example/sitemap.xml", { method: "GET" }, env);
    expect(await sitemap.text()).toContain("https://canonical.example/feed/1");
    const robots = await ctx.app.request("https://other.example/robots.txt", { method: "GET" }, env);
    expect(await robots.text()).toContain("Sitemap: https://canonical.example/sitemap.xml");
    expect(keys).toEqual(["cache/sitemap-v2.json", "cache/robots.txt"]);

    cleanupTestDB(ctx.sqlite);
  });
});

describe("sitemapCrontab", () => {
  it("does not write sitemap or robots caches without FRONTEND_URL", async () => {
    let putCalls = 0;
    const env = createMockEnv({
      R2_BUCKET: {
        put: async () => {
          putCalls += 1;
          return null;
        },
      } as unknown as R2Bucket,
    });
    const ctx = await setupTestApp(SitemapService, env);

    await sitemapCrontab(env, ctx.db);

    expect(putCalls).toBe(0);
    cleanupTestDB(ctx.sqlite);
  });

  it("writes sitemap and robots caches when FRONTEND_URL is configured", async () => {
    const keys: string[] = [];
    const env = createMockEnv({
      FRONTEND_URL: "https://canonical.example",
      R2_BUCKET: {
        get: async () => null,
        put: async (key: string) => {
          keys.push(key);
          return null;
        },
      } as unknown as R2Bucket,
    });
    const ctx = await setupTestApp(SitemapService, env);

    await sitemapCrontab(env, ctx.db);

    expect(keys).toEqual(["cache/sitemap-v2.json", "cache/robots.txt"]);
    cleanupTestDB(ctx.sqlite);
  });

  it("reuses valid caches across cron runs and regenerates only after content changes", async () => {
    const storage = createSitemapStorage();
    const ctx = await setupTestApp(sitemapTestApp, storage.env);
    try {
      ctx.sqlite.exec(`INSERT INTO users (id, username, openid, permission) VALUES (1, 'admin', 'gh_admin', 1)`);
      await sitemapCrontab(storage.env, ctx.db);
      expect(storage.writes).toEqual(["cache/sitemap-v2.json", "cache/robots.txt"]);
      await sitemapCrontab(storage.env, ctx.db);
      expect(storage.writes).toHaveLength(2);
      const created = await ctx.app.request("/page", {
        method: "POST", headers: ADMIN_HEADERS,
        body: JSON.stringify({ title: "About", content: "Content", slug: "about" }),
      }, storage.env);
      expect(created.status).toBe(200);
      await sitemapCrontab(storage.env, ctx.db);
      expect(storage.writes).toEqual(["cache/sitemap-v2.json", "cache/robots.txt", "cache/sitemap-v2.json"]);
      const response = await ctx.app.request("/sitemap.xml", {}, storage.env);
      expect(await response.text()).toContain("/page/about</loc>");
      expect(storage.writes).toHaveLength(3);
    } finally {
      cleanupTestDB(ctx.sqlite);
    }
  });
});
