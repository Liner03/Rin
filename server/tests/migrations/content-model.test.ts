import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

function migration(version: number) {
  return readFileSync(new URL(`../../sql/${String(version).padStart(4, "0")}.sql`, import.meta.url), "utf8");
}

// D1 executes migrations in a transaction with foreign keys enabled.
function migrate(db: Database, version = 11) {
  db.transaction(() => {
    for (const statement of migration(version).split(/-->\s*statement-breakpoint/)) {
      const sql = statement.replace(/^--.*$/gm, "").trim();
      if (sql) db.run(sql);
    }
  })();
}

describe("Typecho content model migration", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    for (let version = 0; version <= 10; version++) {
      db.exec(migration(version));
    }
    db.exec("INSERT INTO users (id, username, openid) VALUES (7, 'admin', 'admin')");
  });

  afterEach(() => {
    db.close();
  });

  it("preserves an existing post and its ID when upgrading from version 10", () => {
    db.exec(`
      INSERT INTO feeds (
        id, title, content, alias, draft, listed, uid, summary,
        ai_summary, ai_summary_status, ai_summary_error, created_at, updated_at
      ) VALUES (
        42, 'Existing post', 'Keep this content', 'existing-post', 0, 1, 7,
        'Summary', 'AI summary', 'failed', 'Retry needed', 1700000000, 1700000100
      )
    `);

    migrate(db);

    expect(db.query(`
      SELECT id, type, title, text, slug, status, uid, summary,
        ai_summary, ai_summary_status, ai_summary_error, created_at, updated_at, top
      FROM contents
    `).all()).toEqual([
      {
        id: 42, type: "post", title: "Existing post", text: "Keep this content",
        slug: "existing-post", status: "publish", uid: 7, summary: "Summary",
        ai_summary: "AI summary", ai_summary_status: "failed", ai_summary_error: "Retry needed",
        created_at: 1700000000, updated_at: 1700000100, top: 0,
      },
    ]);
    expect(db.query("INSERT INTO contents (title, uid) VALUES ('New post', 7) RETURNING id").get()).toEqual({ id: 43 });
  });

  it.each([false, true])("maps visibility and nullable fields (legacy top column: %s)", (hasTop) => {
    if (hasTop) {
      db.exec("ALTER TABLE feeds ADD COLUMN top INTEGER DEFAULT 0");
    }
    db.exec(`
      INSERT INTO feeds (id, title, content, alias, draft, listed, uid) VALUES
        (1, NULL, 'Published', NULL, 0, 1, 7),
        (2, 'Hidden', 'Hidden', '', 0, 0, 7),
        (3, 'Draft', 'Draft', '', 1, 1, 7),
        (4, 'Unlisted draft', 'Still private', NULL, 1, 0, 7)
    `);
    if (hasTop) {
      db.exec("UPDATE feeds SET top = 9 WHERE id = 1");
      db.exec("UPDATE feeds SET top = NULL WHERE id = 2");
    }

    migrate(db);

    expect(db.query("SELECT id, title, slug, status, top FROM contents ORDER BY id").all()).toEqual([
      { id: 1, title: "", slug: null, status: "publish", top: hasTop ? 9 : 0 },
      { id: 2, title: "Hidden", slug: null, status: "hidden", top: 0 },
      { id: 3, title: "Draft", slug: null, status: "draft", top: 0 },
      { id: 4, title: "Unlisted draft", slug: null, status: "draft", top: 0 },
    ]);
  });

  it("preserves comments, raw visits and aggregate PV/HLL data without orphaning or cascading them", () => {
    db.exec(`
      INSERT INTO feeds (id, title, content, draft, uid) VALUES (42, 'Post', 'Content', 0, 7);
      INSERT INTO comments (
        id, feed_id, user_id, content, guest_name, guest_email, guest_website, approved, created_at, updated_at
      ) VALUES
        (11, 42, 7, 'Member comment', '', '', '', 1, 1700000000, 1700000100),
        (12, 42, NULL, 'Guest comment', 'Guest', 'guest@example.com', 'https://example.com', 0, 1700000200, 1700000300);
      INSERT INTO visits (id, feed_id, ip, created_at) VALUES
        (21, 42, '192.0.2.1', 1700000000),
        (22, 42, '2001:db8::1', 1700000100);
      INSERT INTO visit_stats (feed_id, pv, hll_data, updated_at)
        VALUES (42, 12345, 'existing-hll-data', 1700000200);
    `);
    const comments = db.query(`
      SELECT id, feed_id AS content_id, user_id, content, guest_name, guest_email, guest_website,
        approved, created_at, updated_at FROM comments ORDER BY id
    `).all();
    const visits = db.query("SELECT id, feed_id AS content_id, ip, created_at FROM visits ORDER BY id").all();
    const stats = db.query("SELECT feed_id AS content_id, pv, hll_data, updated_at FROM visit_stats").all();

    migrate(db);

    expect(db.query("SELECT * FROM comments ORDER BY id").all()).toEqual(comments);
    expect(db.query("SELECT * FROM visits ORDER BY id").all()).toEqual(visits);
    expect(db.query("SELECT * FROM visit_stats").all()).toEqual(stats);
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);

    // References now target contents, and deletion semantics still work.
    db.exec("DELETE FROM contents WHERE id = 42");
    expect(db.query("SELECT * FROM comments").all()).toEqual([]);
    expect(db.query("SELECT * FROM visits").all()).toEqual([]);
    expect(db.query("SELECT * FROM visit_stats").all()).toEqual([]);
  });

  it("preserves tags and deduplicates bindings while counting only published posts", () => {
    db.exec(`
      INSERT INTO feeds (id, content, draft, listed, uid, created_at) VALUES
        (1, 'Published', 0, 1, 7, 1700000000),
        (2, 'Hidden', 0, 0, 7, 1700000000),
        (3, 'Draft', 1, 1, 7, 1700000000),
        (4, 'Scheduled', 0, 1, 7, 32503680000);
      INSERT INTO hashtags (id, name, created_at, updated_at) VALUES
        (5, '技术', 1700000000, 1700000100),
        (6, '技术', 1700000200, 1700000300),
        (7, 'Unused', 1700000000, 1700000100);
      INSERT INTO feed_hashtags (feed_id, hashtag_id, created_at, updated_at) VALUES
        (1, 5, 1700000000, 1700000100),
        (1, 5, 1700000200, 1700000300),
        (2, 5, 1700000000, 1700000100),
        (3, 5, 1700000000, 1700000100),
        (4, 5, 1700000000, 1700000100),
        (1, 6, 1700000000, 1700000100);
    `);
    const tags = db.query("SELECT id, name, created_at, updated_at FROM hashtags ORDER BY id").all();

    migrate(db);

    expect(db.query("SELECT id, name, created_at, updated_at FROM metas ORDER BY id").all()).toEqual(tags);
    expect(db.query("SELECT id, type, count FROM metas ORDER BY id").all()).toEqual([
      { id: 5, type: "tag", count: 1 },
      { id: 6, type: "tag", count: 1 },
      { id: 7, type: "tag", count: 0 },
    ]);
    expect(db.query("SELECT content_id, meta_id FROM relationships ORDER BY content_id, meta_id").all()).toEqual([
      { content_id: 1, meta_id: 5 }, { content_id: 1, meta_id: 6 },
      { content_id: 2, meta_id: 5 }, { content_id: 3, meta_id: 5 }, { content_id: 4, meta_id: 5 },
    ]);
    expect(db.query("SELECT created_at, updated_at FROM relationships WHERE content_id = 1 AND meta_id = 5").get())
      .toEqual({ created_at: 1700000000, updated_at: 1700000300 });
    expect(db.query("INSERT INTO metas (name) VALUES ('New tag') RETURNING id").get()).toEqual({ id: 8 });
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("initializes a new database through the latest migration", () => {
    db.exec("DELETE FROM users");
    for (let version = 11; version <= 14; version++) {
      migrate(db, version);
    }

    expect(db.query("SELECT value FROM info WHERE key = 'migration_version'").get()).toEqual({ value: "14" });
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('feeds', 'hashtags', 'feed_hashtags')").all())
      .toEqual([]);
    db.exec("INSERT INTO users (id, username, openid) VALUES (7, 'admin', 'admin')");
    expect(db.query("INSERT INTO contents (title, uid) VALUES ('First post', 7) RETURNING id, top, cover").get())
      .toEqual({ id: 1, top: 0, cover: null });
  });

  it("rejects conflicting non-empty aliases without discarding posts or advancing the version", () => {
    db.exec(`
      INSERT INTO feeds (id, content, alias, uid) VALUES
        (1, 'First post', 'duplicate', 7),
        (2, 'Second post', 'duplicate', 7)
    `);
    const posts = db.query("SELECT * FROM feeds ORDER BY id").all();

    expect(() => migrate(db)).toThrow("UNIQUE constraint failed");

    expect(db.query("SELECT * FROM feeds ORDER BY id").all()).toEqual(posts);
    expect(db.query("SELECT value FROM info WHERE key = 'migration_version'").get()).toEqual({ value: "10" });
    expect(db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'contents'").all()).toEqual([]);
  });

  it("rejects orphaned legacy relationships instead of silently dropping them", () => {
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("INSERT INTO feed_hashtags (feed_id, hashtag_id) VALUES (42, 5)");
    db.exec("PRAGMA foreign_keys = ON");

    expect(() => migrate(db)).toThrow("FOREIGN KEY constraint failed");

    expect(db.query("SELECT feed_id, hashtag_id FROM feed_hashtags").all()).toEqual([{ feed_id: 42, hashtag_id: 5 }]);
    expect(db.query("SELECT value FROM info WHERE key = 'migration_version'").get()).toEqual({ value: "10" });
  });
});
