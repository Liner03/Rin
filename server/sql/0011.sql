-- Typecho-aligned content model
-- Create polymorphic contents table (post/page/attachment), metas (category/tag),
-- relationships (M2M), and custom fields.

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
CREATE TABLE IF NOT EXISTS `comments_new` (
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
-- Recreate visits referencing contents
DROP TABLE `visits`;

--> statement-breakpoint
CREATE TABLE `visits` (
	`id` integer PRIMARY KEY NOT NULL,
	`content_id` integer NOT NULL,
	`ip` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
-- Recreate visit_stats referencing contents
DROP TABLE `visit_stats`;

--> statement-breakpoint
CREATE TABLE `visit_stats` (
	`content_id` integer PRIMARY KEY NOT NULL,
	`pv` integer DEFAULT 0 NOT NULL,
	`hll_data` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
-- Drop old tables
DROP TABLE `feed_hashtags`;

--> statement-breakpoint
DROP TABLE `hashtags`;

--> statement-breakpoint
DROP TABLE `feeds`;

--> statement-breakpoint
UPDATE `info` SET `value` = '11' WHERE `key` = 'migration_version';
