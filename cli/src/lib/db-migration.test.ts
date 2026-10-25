import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import { fixTopField } from "./db-migration";

describe("legacy top field repair", () => {
  let db: Database;
  let restoreSpawn: () => void;

  beforeEach(() => {
    db = new Database(":memory:");
    // Exercise the real SQL against SQLite without launching Wrangler or touching a user database.
    const spawn = spyOn(Bun, "spawn").mockImplementation((...args: unknown[]) => {
      const command = args[0];
      if (!Array.isArray(command)) throw new Error("Expected Wrangler arguments");
      const sql = command[command.indexOf("--command") + 1];
      let stdout = "";
      let stderr = "";
      let exitCode = 0;
      try {
        stdout = JSON.stringify([{ results: db.query(sql).all() }]);
      } catch (error) {
        stderr = String(error);
        exitCode = 1;
      }
      return {
        stdout: new Response(stdout).body,
        stderr: new Response(stderr).body,
        exited: Promise.resolve(exitCode),
      } as unknown as ReturnType<typeof Bun.spawn>;
    });
    restoreSpawn = () => spawn.mockRestore();
  });

  afterEach(() => {
    restoreSpawn();
    db.close();
  });

  it("skips feeds repair after a fresh database has migrated to contents", async () => {
    db.exec("CREATE TABLE contents (id INTEGER PRIMARY KEY, top INTEGER DEFAULT 0)");

    await fixTopField("local", "test");

    expect(db.query("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toEqual([{ name: "contents" }]);
  });

  it("still adds top to a legacy feeds table without losing posts", async () => {
    db.exec("CREATE TABLE feeds (id INTEGER PRIMARY KEY)");
    db.exec("INSERT INTO feeds (id) VALUES (42)");

    await fixTopField("local", "test");

    expect(db.query("SELECT id, top FROM feeds").all()).toEqual([{ id: 42, top: 0 }]);
  });

  it("keeps existing legacy top values", async () => {
    db.exec("CREATE TABLE feeds (id INTEGER PRIMARY KEY, top INTEGER)");
    db.exec("INSERT INTO feeds (id, top) VALUES (42, 9)");

    await fixTopField("local", "test");

    expect(db.query("SELECT id, top FROM feeds").all()).toEqual([{ id: 42, top: 9 }]);
  });
});
