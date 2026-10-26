import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

function migrate(db: Database, version: number) {
  const source = readFileSync(new URL(`../../sql/${String(version).padStart(4, "0")}.sql`, import.meta.url), "utf8");
  db.transaction(() => {
    for (const statement of source.split(/-->\s*statement-breakpoint/)) {
      const sql = statement.replace(/^--.*$/gm, "").trim();
      if (sql) db.run(sql);
    }
  })();
}

const MUTATIONS = [
  ["post insert", "INSERT INTO contents (id, title, uid) VALUES (3, 'New post', 1)"],
  ["post update", "UPDATE contents SET slug = 'renamed' WHERE id = 1"],
  ["post delete", "DELETE FROM contents WHERE id = 1"],
  ["page insert", "INSERT INTO contents (id, type, title, uid) VALUES (3, 'page', 'New page', 1)"],
  ["page update", "UPDATE contents SET slug = 'renamed-page' WHERE id = 2"],
  ["page delete", "DELETE FROM contents WHERE id = 2"],
  ["tag insert", "INSERT INTO metas (id, name) VALUES (3, 'New tag')"],
  ["tag update", "UPDATE metas SET name = 'Renamed tag' WHERE id = 1"],
  ["tag delete", "DELETE FROM metas WHERE id = 1"],
  ["category insert", "INSERT INTO metas (id, type, name) VALUES (3, 'category', 'New category')"],
  ["category update", "UPDATE metas SET listed = 0 WHERE id = 2"],
  ["category delete", "DELETE FROM metas WHERE id = 2"],
  ["relationship insert", "INSERT INTO relationships (content_id, meta_id) VALUES (2, 2)"],
  ["relationship update", "UPDATE relationships SET content_id = 2 WHERE content_id = 1"],
  ["relationship delete", "DELETE FROM relationships WHERE content_id = 1"],
  ["moment insert", "INSERT INTO moments (id, content, uid) VALUES (2, 'New moment', 1)"],
  ["moment update", "UPDATE moments SET content = 'Edited moment' WHERE id = 1"],
  ["moment delete", "DELETE FROM moments WHERE id = 1"],
  ["friend insert", "INSERT INTO friends (id, name, avatar, url, uid, accepted) VALUES (3, 'New friend', '', 'https://new.example', 1, 1)"],
  ["friend update", "UPDATE friends SET name = 'Edited friend' WHERE id = 1"],
  ["friend delete", "DELETE FROM friends WHERE id = 1"],
  ["friend approval", "UPDATE friends SET accepted = 1 WHERE id = 2"],
  ["friend rejection", "UPDATE friends SET accepted = 0 WHERE id = 1"],
  ["friend cascade deletion", "DELETE FROM users WHERE id = 2"],
] as const;

describe("Atomic sitemap revision migration", () => {
  let db: Database;
  const revision = () => {
    const row = db.query<{ value: string }, []>(
      "SELECT value FROM cache WHERE type = 'sitemap' AND key = 'revision'",
    ).get();
    if (!row) throw new Error("Missing sitemap revision");
    return row.value;
  };
  const snapshot = () => ["users", "contents", "metas", "relationships", "moments", "friends", "cache"].map((table) =>
    db.query(`SELECT * FROM ${table} ORDER BY 1, 2`).all());

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    for (let version = 0; version <= 15; version++) migrate(db, version);
    db.exec(`
      INSERT INTO users (id, username, openid) VALUES (1, 'admin', 'admin'), (2, 'friend owner', 'owner');
      INSERT INTO contents (id, type, title, slug, uid) VALUES (1, 'post', 'Post', 'post', 1), (2, 'page', 'Page', 'page', 1);
      INSERT INTO metas (id, type, name, slug) VALUES (1, 'tag', 'Tag', 'tag'), (2, 'category', 'Category', 'category');
      INSERT INTO relationships (content_id, meta_id) VALUES (1, 1), (1, 2);
      INSERT INTO moments (id, content, uid) VALUES (1, 'Moment', 1);
      INSERT INTO friends (id, name, avatar, url, uid, accepted) VALUES
        (1, 'Approved', '', 'https://friend.example', 2, 1), (2, 'Pending', '', 'https://pending.example', 2, 0);
      INSERT INTO cache (key, type, value) VALUES ('revision', 'sitemap', 'old-revision'), ('keep', 'cache', 'keep-me');
    `);
  });

  afterEach(() => db.close());

  it("preserves existing data and invalidates the old cache when upgrading version 15", () => {
    const before = snapshot().slice(0, -1);
    migrate(db, 16);

    expect(snapshot().slice(0, -1)).toEqual(before);
    expect(revision()).toMatch(/^[0-9a-f]{32}$/);
    expect(revision()).not.toBe("old-revision");
    expect(db.query("SELECT value FROM cache WHERE key = 'keep' AND type = 'cache'").get()).toEqual({ value: "keep-me" });
    expect(db.query("SELECT value FROM info WHERE key = 'migration_version'").get()).toEqual({ value: "16" });
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it.each(MUTATIONS)("rolls back %s if revision persistence fails, then invalidates on retry", (_name, sql) => {
    migrate(db, 16);
    const before = snapshot();
    const previousRevision = revision();
    db.exec(`CREATE TRIGGER fail_sitemap_revision BEFORE INSERT ON cache WHEN NEW.type = 'sitemap'
      BEGIN SELECT RAISE(ABORT, 'revision write failed'); END`);

    expect(() => db.run(sql)).toThrow("revision write failed");
    expect(snapshot()).toEqual(before);
    db.exec("DROP TRIGGER fail_sitemap_revision");
    db.run(sql);
    expect(revision()).not.toBe(previousRevision);
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("does not invalidate on periodic maintenance, pending friends, or unchanged values", () => {
    migrate(db, 16);
    const before = revision();
    for (const sql of [
      "UPDATE friends SET health = '503' WHERE id = 1",
      "UPDATE contents SET ai_summary_status = 'processing', ai_summary_error = '' WHERE id = 1",
      "UPDATE metas SET count = count + 1",
      "UPDATE contents SET title = title, slug = slug, updated_at = updated_at",
      "UPDATE metas SET name = name, listed = listed, updated_at = updated_at",
      "UPDATE relationships SET content_id = content_id, meta_id = meta_id",
      "UPDATE moments SET content = content, updated_at = updated_at",
      "UPDATE friends SET name = name, accepted = accepted, updated_at = updated_at",
      "UPDATE friends SET name = 'Still pending' WHERE id = 2",
      "INSERT INTO friends (id, name, avatar, url, uid) VALUES (3, 'Pending', '', 'https://pending.example', 2)",
      "DELETE FROM friends WHERE id IN (2, 3)",
    ]) {
      db.run(sql);
      expect(revision()).toBe(before);
    }
  });

  it("uses a different revision for each change within the same second", () => {
    migrate(db, 16);
    const revisions = new Set([revision()]);
    for (let i = 0; i < 10; i++) {
      db.run("UPDATE contents SET title = ? WHERE id = 1", [`Title ${i}`]);
      revisions.add(revision());
    }
    expect(revisions.size).toBe(11);
  });

  it("recreates the revision record if it was cleared", () => {
    migrate(db, 16);
    db.exec("DELETE FROM cache WHERE type = 'sitemap'");
    db.exec("UPDATE contents SET slug = 'new-slug' WHERE id = 1");
    expect(revision()).toMatch(/^[0-9a-f]{32}$/);
  });
});
