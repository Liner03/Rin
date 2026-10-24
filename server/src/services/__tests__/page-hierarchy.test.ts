import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { cleanupTestDB, createTestUser, setupTestApp } from "../../../tests/fixtures";
import { PageService } from "../page";

describe("PageService — hierarchy", () => {
  let ctx: Awaited<ReturnType<typeof setupTestApp>>;
  const headers = { Authorization: "Bearer mock_token_1", "Content-Type": "application/json" };

  beforeEach(async () => {
    ctx = await setupTestApp(PageService);
    ctx.sqlite.exec("PRAGMA foreign_keys = ON");
    createTestUser(ctx.sqlite);
    ctx.sqlite.exec(`
      INSERT INTO contents (id, type, title, text, slug, uid, parent) VALUES
        (1, 'page', 'Parent', 'Body', 'parent', 1, 0),
        (2, 'page', 'Child', 'Body', 'child', 1, 1),
        (3, 'page', 'Grandchild', 'Body', 'grandchild', 1, 2),
        (4, 'post', 'Post', 'Body', 'post', 1, 0),
        (5, 'page', 'Other', 'Body', 'other', 1, 0);
      INSERT INTO fields (content_id, name, str_value) VALUES (1, 'keep', 'original');
    `);
  });
  afterEach(() => cleanupTestDB(ctx.sqlite));

  function write(path: string, method: string, body?: unknown) {
    return ctx.app.request(path, { method, headers, body: JSON.stringify(body) }, ctx.env);
  }

  it.each([999, 4, -1, 1.5, null, "1"])("rejects invalid parents on create and update (%s)", async (parent) => {
    expect((await write("/", "POST", { title: "New", content: "Body", slug: "new", parent })).status).toBe(400);
    expect((await write("/2", "POST", { parent })).status).toBe(400);
    expect(ctx.sqlite.query("SELECT id FROM contents WHERE slug = 'new'").all()).toEqual([]);
    expect(ctx.sqlite.query("SELECT parent FROM contents WHERE id = 2").get()).toEqual({ parent: 1 });
  });

  it.each([1, 2, 3])("rejects self and descendant parents without changing content (%s)", async (parent) => {
    const response = await write("/1", "POST", { parent, title: "Changed", fields: [] });
    expect(response.status).toBe(400);
    expect(ctx.sqlite.query("SELECT title, parent FROM contents WHERE id = 1").get()).toEqual({ title: "Parent", parent: 0 });
    expect(ctx.sqlite.query("SELECT str_value FROM fields WHERE content_id = 1").get()).toEqual({ str_value: "original" });
  });

  it("creates roots and children, allows reparenting, and preserves omitted parents", async () => {
    expect((await write("/", "POST", { title: "Root", content: "Body", slug: "root" })).status).toBe(200);
    expect((await write("/", "POST", { title: "New", content: "Body", slug: "new", parent: 3 })).status).toBe(200);
    expect(ctx.sqlite.query("SELECT parent FROM contents WHERE slug = 'new'").get()).toEqual({ parent: 3 });
    expect((await write("/2", "POST", { parent: 5 })).status).toBe(200);
    expect((await write("/2", "POST", { title: "Updated" })).status).toBe(200);
    expect(ctx.sqlite.query("SELECT parent, title FROM contents WHERE id = 2").get()).toEqual({ parent: 5, title: "Updated" });
    expect((await write("/2", "POST", { parent: 0 })).status).toBe(200);
  });

  it("blocks deleting a parent until its children are moved or removed", async () => {
    expect((await write("/1", "DELETE")).status).toBe(409);
    expect(ctx.sqlite.query("SELECT id FROM contents WHERE id = 1").get()).toEqual({ id: 1 });
    expect(ctx.sqlite.query("SELECT parent FROM contents WHERE id = 2").get()).toEqual({ parent: 1 });
    expect(ctx.sqlite.query("SELECT str_value FROM fields WHERE content_id = 1").get()).toEqual({ str_value: "original" });
    expect((await write("/2", "POST", { parent: 0 })).status).toBe(200);
    expect((await write("/1", "DELETE")).status).toBe(200);
    expect(ctx.sqlite.query("SELECT id FROM fields WHERE content_id = 1").all()).toEqual([]);
    expect((await write("/3", "DELETE")).status).toBe(200);
    expect((await write("/2", "DELETE")).status).toBe(200);
  });

  it("rejects attachment to legacy cycles and allows detaching a page to repair them", async () => {
    ctx.sqlite.exec("UPDATE contents SET parent = 3 WHERE id = 1");
    expect((await write("/5", "POST", { parent: 2 })).status).toBe(400);
    expect((await write("/1", "POST", { parent: 0 })).status).toBe(200);
    expect((await write("/5", "POST", { parent: 2 })).status).toBe(200);
  });
});
