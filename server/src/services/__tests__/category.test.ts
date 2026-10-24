import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { CategoryDetail } from "@rin/api";
import { cleanupTestDB, createTestUser, setupTestApp } from "../../../tests/fixtures";
import { CategoryService } from "../category";

describe("CategoryService", () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  const adminHeaders = { Authorization: "Bearer mock_token_1", "Content-Type": "application/json" };

  beforeEach(async () => {
    ctx = await setupTestApp(CategoryService);
    createTestUser(ctx.sqlite);
    ctx.sqlite.exec(`
      INSERT INTO metas (id, type, name, slug, parent) VALUES
        (1, 'category', 'Parent', 'parent', 0),
        (2, 'category', 'Child', 'child', 1),
        (3, 'category', 'Other', 'other', 0),
        (4, 'tag', 'Tag', 'tag', 0);
      INSERT INTO contents (id, type, title, text, status, slug, uid) VALUES
        (101, 'post', 'One post', 'Body', 'publish', 'one-post', 1),
        (102, 'post', 'Draft', 'Body', 'draft', 'draft', 1);
      INSERT INTO relationships (content_id, meta_id) VALUES (101, 1), (101, 2), (102, 2);
    `);
  });

  afterEach(() => cleanupTestDB(ctx.sqlite));

  function write(path: string, method: string, body?: unknown) {
    return ctx.app.request(path, { method, headers: adminHeaders, body: JSON.stringify(body) }, ctx.env);
  }

  it("lists each published post once across the parent and its descendants", async () => {
    const response = await ctx.app.request("/parent", {}, ctx.env);
    expect(response.status).toBe(200);
    const category = await response.json() as CategoryDetail;
    expect(category.feeds.map((feed) => feed.id)).toEqual([101]);
    expect(category.feeds[0].categories?.map((item) => item.id)).toEqual([1, 2]);
  });

  it.each([1, 2])("rejects making the parent category its own ancestor (%i)", async (parent) => {
    const response = await write("/1", "PUT", { parent });
    expect(response.status).toBe(400);
    expect(ctx.sqlite.query("SELECT parent FROM metas WHERE id = 1").get()).toEqual({ parent: 0 });
  });

  it.each([999, 4, -1, 1.5])("rejects invalid parents when creating a category (%i)", async (parent) => {
    const response = await write("/", "POST", { name: "New", slug: "new", parent });
    expect(response.status).toBe(400);
    expect(ctx.sqlite.query("SELECT id FROM metas WHERE slug = 'new'").all()).toEqual([]);
  });

  it("rejects a nonexistent parent on update", async () => {
    expect((await write("/2", "PUT", { parent: 999 })).status).toBe(400);
    expect(ctx.sqlite.query("SELECT parent FROM metas WHERE id = 2").get()).toEqual({ parent: 1 });
  });

  it("supports valid reparenting and preserves the parent on unrelated edits", async () => {
    expect((await write("/2", "PUT", { parent: 3 })).status).toBe(200);
    expect((await write("/2", "PUT", { description: "Updated" })).status).toBe(200);
    expect(ctx.sqlite.query("SELECT parent, description FROM metas WHERE id = 2").get())
      .toEqual({ parent: 3, description: "Updated" });
    expect((await write("/2", "PUT", { parent: 0 })).status).toBe(200);
  });

  it("keeps child categories attached when deletion of their parent is rejected", async () => {
    expect((await write("/1", "DELETE")).status).toBe(409);
    expect(ctx.sqlite.query("SELECT parent FROM metas WHERE id = 2").get()).toEqual({ parent: 1 });
    expect(ctx.sqlite.query("SELECT id FROM metas WHERE id = 1").get()).toEqual({ id: 1 });
    expect((await write("/2", "DELETE")).status).toBe(200);
    expect((await write("/1", "DELETE")).status).toBe(200);
  });

  it("finishes reads of a legacy cycle without duplicating posts", async () => {
    ctx.sqlite.exec("UPDATE metas SET parent = 2 WHERE id = 1");
    const response = await ctx.app.request("/parent", {}, ctx.env);
    expect(response.status).toBe(200);
    const category = await response.json() as CategoryDetail;
    expect(category.feeds.map((feed) => feed.id)).toEqual([101]);
    expect((await write("/3", "PUT", { parent: 1 })).status).toBe(400);
    expect((await write("/1", "PUT", { parent: 0 })).status).toBe(200);
  });

  it("generates distinct slugs for categories with the same name", async () => {
    expect((await write("/", "POST", { name: "Parent" })).status).toBe(200);
    expect((await write("/", "POST", { name: "Parent" })).status).toBe(200);
    expect(ctx.sqlite.query("SELECT slug FROM metas WHERE type = 'category' AND name = 'Parent' ORDER BY id").all())
      .toEqual([{ slug: "parent" }, { slug: "parent-1" }, { slug: "parent-2" }]);
  });

  it("keeps category slugs independent from post and tag slugs", async () => {
    expect((await write("/", "POST", { name: "One post" })).status).toBe(200);
    expect((await write("/", "POST", { name: "Tag" })).status).toBe(200);
    expect(ctx.sqlite.query("SELECT slug FROM metas WHERE type = 'category' AND id > 4 ORDER BY id").all())
      .toEqual([{ slug: "one-post" }, { slug: "tag" }]);
  });

  it("returns a conflict for explicit duplicate slugs without changing categories", async () => {
    expect((await write("/", "POST", { name: "Duplicate", slug: "parent" })).status).toBe(409);
    expect((await write("/2", "PUT", { slug: "parent", name: "Changed" })).status).toBe(409);
    expect(ctx.sqlite.query("SELECT name, slug FROM metas WHERE id = 2").get()).toEqual({ name: "Child", slug: "child" });
    expect(ctx.sqlite.query("SELECT id FROM metas WHERE name = 'Duplicate'").all()).toEqual([]);
    expect((await write("/1", "PUT", { slug: "parent", description: "Updated" })).status).toBe(200);
  });

  it("preserves omitted slugs and generates a valid unique slug when clearing one", async () => {
    expect((await write("/2", "PUT", { name: "Parent" })).status).toBe(200);
    expect(ctx.sqlite.query("SELECT slug FROM metas WHERE id = 2").get()).toEqual({ slug: "child" });
    expect((await write("/2", "PUT", { slug: "" })).status).toBe(200);
    expect(ctx.sqlite.query("SELECT slug FROM metas WHERE id = 2").get()).toEqual({ slug: "parent-1" });
    expect((await write("/2", "PUT", { slug: "  custom  " })).status).toBe(200);
    expect(ctx.sqlite.query("SELECT slug FROM metas WHERE id = 2").get()).toEqual({ slug: "custom" });
  });
});
