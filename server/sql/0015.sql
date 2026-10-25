-- Adapt upstream query indexes to the fork's contents/metas model.
-- Keep 0011-0014 unchanged: their version numbers belong to this fork.
CREATE INDEX IF NOT EXISTS `idx_contents_visibility_order` ON `contents` (`type`, `status`, `top`, `created_at`, `updated_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_contents_uid` ON `contents` (`uid`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_metas_type_name` ON `metas` (`type`, `name`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_relationships_meta_content` ON `relationships` (`meta_id`, `content_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_visits_content_created` ON `visits` (`content_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_friends_accepted_order` ON `friends` (`accepted`, `sort_order`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_users_openid` ON `users` (`openid`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_cache_type_key` ON `cache` (`type`, `key`);
--> statement-breakpoint
UPDATE `info` SET `value` = '15' WHERE `key` = 'migration_version';
