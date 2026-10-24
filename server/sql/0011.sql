-- Typecho-aligned content model
-- Create polymorphic contents table (post/page/attachment), metas (category/tag),
-- relationships (M2M), and custom fields. Copy parents before their children,
-- preserving IDs, and only drop legacy tables after every copy succeeds.

--> statement-breakpoint
CREATE TABLE `contents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text DEFAULT 'post' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`slug` text,
	`text` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`ai_summary` text DEFAULT '' NOT NULL,
	`ai_summary_status` text DEFAULT 'idle' NOT NULL,
	`ai_summary_error` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'publish' NOT NULL,
	`password` text DEFAULT '',
	`top` integer DEFAULT 0 NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`template` text DEFAULT '',
	`allow_comment` integer DEFAULT 1 NOT NULL,
	`allow_ping` integer DEFAULT 1 NOT NULL,
	`allow_feed` integer DEFAULT 1 NOT NULL,
	`parent` integer DEFAULT 0 NOT NULL,
	`uid` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`uid`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE UNIQUE INDEX `contents_slug_unique` ON `contents` (`slug`);

--> statement-breakpoint
-- SQL-only installations lack top; legacy installations may already have it.
-- SQLite resolves top to the first matching column in this subquery: feeds.top
-- when present, otherwise the appended default. NULL/empty aliases have no slug.
-- Conflicting non-empty aliases deliberately fail instead of discarding posts.
INSERT INTO `contents` (
	`id`, `type`, `title`, `slug`, `text`, `summary`,
	`ai_summary`, `ai_summary_status`, `ai_summary_error`,
	`status`, `top`, `uid`, `created_at`, `updated_at`
)
SELECT
	`id`, 'post', COALESCE(`title`, ''), NULLIF(`alias`, ''), `content`, `summary`,
	`ai_summary`, `ai_summary_status`, `ai_summary_error`,
	CASE WHEN `draft` = 1 THEN 'draft' WHEN `listed` = 0 THEN 'hidden' ELSE 'publish' END,
	COALESCE(`top`, 0), `uid`, `created_at`, `updated_at`
FROM (SELECT *, 0 AS `top` FROM `feeds`);

--> statement-breakpoint
CREATE TABLE `metas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text DEFAULT 'tag' NOT NULL,
	`name` text NOT NULL,
	`slug` text,
	`description` text DEFAULT '' NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`parent` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);

--> statement-breakpoint
CREATE UNIQUE INDEX `metas_slug_type_unique` ON `metas` (`slug`,`type`);

--> statement-breakpoint
-- Legacy tags are addressed by name and have no slug. Keep their names and IDs,
-- including duplicate names, rather than inventing potentially conflicting slugs.
INSERT INTO `metas` (`id`, `type`, `name`, `created_at`, `updated_at`)
	SELECT `id`, 'tag', `name`, `created_at`, `updated_at` FROM `hashtags`;

--> statement-breakpoint
CREATE TABLE `relationships` (
	`content_id` integer NOT NULL,
	`meta_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`meta_id`) REFERENCES `metas`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE UNIQUE INDEX `relationships_content_id_meta_id_unique` ON `relationships` (`content_id`,`meta_id`);

--> statement-breakpoint
-- The old join table did not enforce uniqueness. Keep one binding per pair,
-- retaining its earliest creation and latest update times.
INSERT INTO `relationships` (`content_id`, `meta_id`, `created_at`, `updated_at`)
	SELECT `feed_id`, `hashtag_id`, MIN(`created_at`), MAX(`updated_at`)
	FROM `feed_hashtags`
	GROUP BY `feed_id`, `hashtag_id`;

--> statement-breakpoint
UPDATE `metas` SET `count` = (
	SELECT COUNT(*) FROM `relationships`
	JOIN `contents` ON `contents`.`id` = `relationships`.`content_id`
	WHERE `relationships`.`meta_id` = `metas`.`id`
		AND `contents`.`type` = 'post'
		AND `contents`.`status` = 'publish'
		AND `contents`.`created_at` <= unixepoch()
);

--> statement-breakpoint
CREATE TABLE `fields` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content_id` integer NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'str' NOT NULL,
	`str_value` text DEFAULT '' NOT NULL,
	`int_value` integer DEFAULT 0 NOT NULL,
	`float_value` real DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE UNIQUE INDEX `fields_content_id_name_unique` ON `fields` (`content_id`,`name`);

--> statement-breakpoint
-- Recreate comments referencing contents instead of feeds
CREATE TABLE `comments_new` (
	`id` integer PRIMARY KEY NOT NULL,
	`content_id` integer NOT NULL,
	`user_id` integer,
	`content` text NOT NULL,
	`guest_name` text DEFAULT '',
	`guest_email` text DEFAULT '',
	`guest_website` text DEFAULT '',
	`approved` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
INSERT INTO `comments_new` (`id`, `content_id`, `user_id`, `content`, `guest_name`, `guest_email`, `guest_website`, `approved`, `created_at`, `updated_at`)
	SELECT `id`, `feed_id`, `user_id`, `content`, `guest_name`, `guest_email`, `guest_website`, `approved`, `created_at`, `updated_at` FROM `comments`;

--> statement-breakpoint
DROP TABLE `comments`;

--> statement-breakpoint
ALTER TABLE `comments_new` RENAME TO `comments`;

--> statement-breakpoint
-- Copy raw visits before replacing their table and foreign key.
CREATE TABLE `visits_new` (
	`id` integer PRIMARY KEY NOT NULL,
	`content_id` integer NOT NULL,
	`ip` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
INSERT INTO `visits_new` (`id`, `content_id`, `ip`, `created_at`)
	SELECT `id`, `feed_id`, `ip`, `created_at` FROM `visits`;

--> statement-breakpoint
DROP TABLE `visits`;

--> statement-breakpoint
ALTER TABLE `visits_new` RENAME TO `visits`;

--> statement-breakpoint
-- Preserve aggregate PV and serialized HLL state, which may include visits
-- no longer present in the raw visits table. Do not recalculate these values.
CREATE TABLE `visit_stats_new` (
	`content_id` integer PRIMARY KEY NOT NULL,
	`pv` integer DEFAULT 0 NOT NULL,
	`hll_data` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
INSERT INTO `visit_stats_new` (`content_id`, `pv`, `hll_data`, `updated_at`)
	SELECT `feed_id`, `pv`, `hll_data`, `updated_at` FROM `visit_stats`;

--> statement-breakpoint
DROP TABLE `visit_stats`;

--> statement-breakpoint
ALTER TABLE `visit_stats_new` RENAME TO `visit_stats`;

--> statement-breakpoint
-- All rows and referencing tables have now been migrated.
DROP TABLE `feed_hashtags`;

--> statement-breakpoint
DROP TABLE `hashtags`;

--> statement-breakpoint
DROP TABLE `feeds`;

--> statement-breakpoint
UPDATE `info` SET `value` = '11' WHERE `key` = 'migration_version';
