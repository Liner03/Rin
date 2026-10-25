import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import {
  ADD_FEEDS_TOP_COLUMN_SQL,
  FEEDS_TABLE_EXISTS_QUERY,
  FEEDS_TOP_EXISTS_QUERY,
  fixTopField,
} from "../../cli/src/lib/db-migration";

const SQL_DIR = new URL("../../server/sql/", import.meta.url).pathname;

function splitStatements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
}

async function applyMigration(db: Database, fileName: string) {
  const sql = await Bun.file(`${SQL_DIR}${fileName}`).text();
  db.transaction(() => {
    for (const statement of splitStatements(sql)) db.exec(statement);
  })();
}

function runTopFieldPreflight(db: Database) {
  if (!db.query(FEEDS_TABLE_EXISTS_QUERY).get()) {
    return;
  }

  if (!db.query(FEEDS_TOP_EXISTS_QUERY).get()) {
    db.exec(ADD_FEEDS_TOP_COLUMN_SQL);
  }
}

function getColumnNames(db: Database, table: string): string[] {
  return db
    .query(`PRAGMA table_info('${table}')`)
    .all()
    .map((row) => (row as { name: string }).name);
}

function getMigrationVersion(db: Database): string {
  const row = db.query("SELECT value FROM info WHERE key='migration_version'").get() as { value: string };
  return row.value;
}

function getVisibilityIndexColumns(db: Database): string[] {
  return db
    .query("PRAGMA index_info('idx_contents_visibility_order')")
    .all()
    .map((row) => (row as { name: string }).name);
}

async function captureTopFieldPreflight(topExists: boolean, tableExists = true): Promise<string[]> {
  const originalSpawn = Bun.spawn;
  const mutableBun = Bun as typeof Bun & { spawn: typeof Bun.spawn };
  const commands: string[] = [];

  const spawnMock = ((args: string[]) => {
    const commandFlag = args.indexOf("--command");
    const command = commandFlag >= 0 ? args[commandFlag + 1] || "" : "";
    commands.push(command);

    let results: Array<{ name: string }> = [];
    if (command === FEEDS_TABLE_EXISTS_QUERY && tableExists) {
      results = [{ name: "feeds" }];
    } else if (command === FEEDS_TOP_EXISTS_QUERY && topExists) {
      results = [{ name: "top" }];
    }

    const stdout = command === ADD_FEEDS_TOP_COLUMN_SQL ? "" : JSON.stringify([{ results }]);
    return {
      stdout: new Blob([stdout]).stream(),
      stderr: new Blob([]).stream(),
      exited: Promise.resolve(0),
    };
  }) as unknown as typeof Bun.spawn;
  mutableBun.spawn = spawnMock;

  try {
    await fixTopField("local", "rin");
  } finally {
    mutableBun.spawn = originalSpawn;
  }

  return commands;
}

describe("feeds.top migration repair", () => {
  it("builds a fresh database through the contents migration and adapted indexes", async () => {
    const db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    try {
      for (let version = 0; version <= 15; version++) {
        await applyMigration(db, `${String(version).padStart(4, "0")}.sql`);
      }
      expect(getColumnNames(db, "feeds")).toEqual([]);
      expect(getColumnNames(db, "contents")).toContain("top");
      expect(getMigrationVersion(db)).toBe("15");
      expect(getVisibilityIndexColumns(db)).toEqual(["type", "status", "top", "created_at", "updated_at"]);
      expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it.each([false, true])("upgrades legacy data after the top preflight (existing top: %s)", async (hasTop) => {
    const db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    try {
      for (let version = 0; version <= 10; version++) {
        await applyMigration(db, `${String(version).padStart(4, "0")}.sql`);
      }
      if (!hasTop) db.exec("ALTER TABLE feeds DROP COLUMN top");
      db.exec("INSERT INTO users (id, username, openid) VALUES (1, 'admin', 'admin')");
      db.exec("INSERT INTO feeds (id, title, content, uid, draft) VALUES (42, 'Keep me', 'Body', 1, 0)");
      if (hasTop) db.exec("UPDATE feeds SET top = 9 WHERE id = 42");
      runTopFieldPreflight(db);
      runTopFieldPreflight(db);
      for (let version = 11; version <= 15; version++) {
        await applyMigration(db, `${String(version).padStart(4, "0")}.sql`);
      }
      expect(db.query("SELECT id, title, text, top FROM contents").get()).toEqual({
        id: 42, title: "Keep me", text: "Body", top: hasTop ? 9 : 0,
      });
      expect(getMigrationVersion(db)).toBe("15");
      expect(getVisibilityIndexColumns(db)).toEqual(["type", "status", "top", "created_at", "updated_at"]);
      // Already migrated databases must not recreate a legacy feeds table.
      runTopFieldPreflight(db);
      expect(getColumnNames(db, "feeds")).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("skips the preflight when feeds does not exist yet", async () => {
    const commands = await captureTopFieldPreflight(false, false);
    expect(commands).toEqual([FEEDS_TABLE_EXISTS_QUERY]);
  });

  it("does not add top when the preflight finds it", async () => {
    const commands = await captureTopFieldPreflight(true);
    expect(commands).toEqual([FEEDS_TABLE_EXISTS_QUERY, FEEDS_TOP_EXISTS_QUERY]);
  });

  it("adds top when the preflight cannot find it", async () => {
    const commands = await captureTopFieldPreflight(false);
    expect(commands).toEqual([FEEDS_TABLE_EXISTS_QUERY, FEEDS_TOP_EXISTS_QUERY, ADD_FEEDS_TOP_COLUMN_SQL]);
  });
});
