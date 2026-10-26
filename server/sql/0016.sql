-- Couple sitemap invalidation to each data statement: a failed revision write
-- rolls back the same SQLite/D1 statement, including imports and cascades.
-- Ignore AI task status, taxonomy counts, and periodic friend health checks.

CREATE TRIGGER IF NOT EXISTS sitemap_contents_insert
AFTER INSERT ON contents
FOR EACH ROW
WHEN NEW.type IN ('post', 'page')
BEGIN
  INSERT INTO cache (key, type, value, updated_at)
  VALUES ('revision', 'sitemap', lower(hex(randomblob(16))), unixepoch())
  ON CONFLICT (key, type) DO UPDATE
  SET value = excluded.value, updated_at = excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sitemap_contents_update
AFTER UPDATE OF "id", "type", "title", "text", "slug", "summary", "cover", "status", "password", "created_at", "updated_at" ON contents
FOR EACH ROW
WHEN (OLD.type IN ('post', 'page') OR NEW.type IN ('post', 'page'))
  AND (OLD."id" IS NOT NEW."id"
    OR OLD."type" IS NOT NEW."type"
    OR OLD."title" IS NOT NEW."title"
    OR OLD."text" IS NOT NEW."text"
    OR OLD."slug" IS NOT NEW."slug"
    OR OLD."summary" IS NOT NEW."summary"
    OR OLD."cover" IS NOT NEW."cover"
    OR OLD."status" IS NOT NEW."status"
    OR OLD."password" IS NOT NEW."password"
    OR OLD."created_at" IS NOT NEW."created_at"
    OR OLD."updated_at" IS NOT NEW."updated_at")
BEGIN
  INSERT INTO cache (key, type, value, updated_at)
  VALUES ('revision', 'sitemap', lower(hex(randomblob(16))), unixepoch())
  ON CONFLICT (key, type) DO UPDATE
  SET value = excluded.value, updated_at = excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sitemap_contents_delete
AFTER DELETE ON contents
FOR EACH ROW
WHEN OLD.type IN ('post', 'page')
BEGIN
  INSERT INTO cache (key, type, value, updated_at)
  VALUES ('revision', 'sitemap', lower(hex(randomblob(16))), unixepoch())
  ON CONFLICT (key, type) DO UPDATE
  SET value = excluded.value, updated_at = excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sitemap_metas_insert
AFTER INSERT ON metas
FOR EACH ROW
WHEN NEW.type IN ('tag', 'category')
BEGIN
  INSERT INTO cache (key, type, value, updated_at)
  VALUES ('revision', 'sitemap', lower(hex(randomblob(16))), unixepoch())
  ON CONFLICT (key, type) DO UPDATE
  SET value = excluded.value, updated_at = excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sitemap_metas_update
AFTER UPDATE OF "id", "type", "name", "slug", "listed", "updated_at" ON metas
FOR EACH ROW
WHEN (OLD.type IN ('tag', 'category') OR NEW.type IN ('tag', 'category'))
  AND (OLD."id" IS NOT NEW."id"
    OR OLD."type" IS NOT NEW."type"
    OR OLD."name" IS NOT NEW."name"
    OR OLD."slug" IS NOT NEW."slug"
    OR OLD."listed" IS NOT NEW."listed"
    OR OLD."updated_at" IS NOT NEW."updated_at")
BEGIN
  INSERT INTO cache (key, type, value, updated_at)
  VALUES ('revision', 'sitemap', lower(hex(randomblob(16))), unixepoch())
  ON CONFLICT (key, type) DO UPDATE
  SET value = excluded.value, updated_at = excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sitemap_metas_delete
AFTER DELETE ON metas
FOR EACH ROW
WHEN OLD.type IN ('tag', 'category')
BEGIN
  INSERT INTO cache (key, type, value, updated_at)
  VALUES ('revision', 'sitemap', lower(hex(randomblob(16))), unixepoch())
  ON CONFLICT (key, type) DO UPDATE
  SET value = excluded.value, updated_at = excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sitemap_relationships_insert
AFTER INSERT ON relationships
FOR EACH ROW
BEGIN
  INSERT INTO cache (key, type, value, updated_at)
  VALUES ('revision', 'sitemap', lower(hex(randomblob(16))), unixepoch())
  ON CONFLICT (key, type) DO UPDATE
  SET value = excluded.value, updated_at = excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sitemap_relationships_update
AFTER UPDATE OF "content_id", "meta_id" ON relationships
FOR EACH ROW
WHEN (OLD."content_id" IS NOT NEW."content_id"
    OR OLD."meta_id" IS NOT NEW."meta_id")
BEGIN
  INSERT INTO cache (key, type, value, updated_at)
  VALUES ('revision', 'sitemap', lower(hex(randomblob(16))), unixepoch())
  ON CONFLICT (key, type) DO UPDATE
  SET value = excluded.value, updated_at = excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sitemap_relationships_delete
AFTER DELETE ON relationships
FOR EACH ROW
BEGIN
  INSERT INTO cache (key, type, value, updated_at)
  VALUES ('revision', 'sitemap', lower(hex(randomblob(16))), unixepoch())
  ON CONFLICT (key, type) DO UPDATE
  SET value = excluded.value, updated_at = excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sitemap_moments_insert
AFTER INSERT ON moments
FOR EACH ROW
BEGIN
  INSERT INTO cache (key, type, value, updated_at)
  VALUES ('revision', 'sitemap', lower(hex(randomblob(16))), unixepoch())
  ON CONFLICT (key, type) DO UPDATE
  SET value = excluded.value, updated_at = excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sitemap_moments_update
AFTER UPDATE OF "id", "content", "updated_at" ON moments
FOR EACH ROW
WHEN (OLD."id" IS NOT NEW."id"
    OR OLD."content" IS NOT NEW."content"
    OR OLD."updated_at" IS NOT NEW."updated_at")
BEGIN
  INSERT INTO cache (key, type, value, updated_at)
  VALUES ('revision', 'sitemap', lower(hex(randomblob(16))), unixepoch())
  ON CONFLICT (key, type) DO UPDATE
  SET value = excluded.value, updated_at = excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sitemap_moments_delete
AFTER DELETE ON moments
FOR EACH ROW
BEGIN
  INSERT INTO cache (key, type, value, updated_at)
  VALUES ('revision', 'sitemap', lower(hex(randomblob(16))), unixepoch())
  ON CONFLICT (key, type) DO UPDATE
  SET value = excluded.value, updated_at = excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sitemap_friends_insert
AFTER INSERT ON friends
FOR EACH ROW
WHEN NEW.accepted = 1
BEGIN
  INSERT INTO cache (key, type, value, updated_at)
  VALUES ('revision', 'sitemap', lower(hex(randomblob(16))), unixepoch())
  ON CONFLICT (key, type) DO UPDATE
  SET value = excluded.value, updated_at = excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sitemap_friends_update
AFTER UPDATE OF "id", "name", "desc", "avatar", "url", "accepted", "sort_order", "updated_at" ON friends
FOR EACH ROW
WHEN (OLD.accepted = 1 OR NEW.accepted = 1)
  AND (OLD."id" IS NOT NEW."id"
    OR OLD."name" IS NOT NEW."name"
    OR OLD."desc" IS NOT NEW."desc"
    OR OLD."avatar" IS NOT NEW."avatar"
    OR OLD."url" IS NOT NEW."url"
    OR OLD."accepted" IS NOT NEW."accepted"
    OR OLD."sort_order" IS NOT NEW."sort_order"
    OR OLD."updated_at" IS NOT NEW."updated_at")
BEGIN
  INSERT INTO cache (key, type, value, updated_at)
  VALUES ('revision', 'sitemap', lower(hex(randomblob(16))), unixepoch())
  ON CONFLICT (key, type) DO UPDATE
  SET value = excluded.value, updated_at = excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sitemap_friends_delete
AFTER DELETE ON friends
FOR EACH ROW
WHEN OLD.accepted = 1
BEGIN
  INSERT INTO cache (key, type, value, updated_at)
  VALUES ('revision', 'sitemap', lower(hex(randomblob(16))), unixepoch())
  ON CONFLICT (key, type) DO UPDATE
  SET value = excluded.value, updated_at = excluded.updated_at;
END;
--> statement-breakpoint
-- Invalidate previously generated caches once when installing the triggers.
INSERT INTO cache (key, type, value, updated_at)
  VALUES ('revision', 'sitemap', lower(hex(randomblob(16))), unixepoch())
  ON CONFLICT (key, type) DO UPDATE
  SET value = excluded.value, updated_at = excluded.updated_at;
--> statement-breakpoint
UPDATE info SET value = '16' WHERE key = 'migration_version';
