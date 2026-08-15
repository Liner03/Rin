-- Performance indexes: relationships.meta_id, contents (type,status,created_at), comments (content_id,created_at), visits (content_id), metas (parent)
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_relationships_meta_id` ON `relationships` (`meta_id`);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_contents_type_status_created` ON `contents` (`type`,`status`,`created_at`);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comments_content_id_created` ON `comments` (`content_id`,`created_at`);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_visits_content_id` ON `visits` (`content_id`);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_metas_parent` ON `metas` (`parent`);

--> statement-breakpoint
UPDATE `info` SET `value` = '13' WHERE `key` = 'migration_version';
