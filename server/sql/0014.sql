-- Index for users.username (login lookup) and metas.type (tag/category lists)
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_users_username` ON `users` (`username`);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_metas_type` ON `metas` (`type`);

--> statement-breakpoint
UPDATE `info` SET `value` = '14' WHERE `key` = 'migration_version';
