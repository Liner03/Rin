-- Cover image for contents (article cover), and home visibility flag for metas (category)
--> statement-breakpoint
ALTER TABLE `contents` ADD COLUMN `cover` text;

--> statement-breakpoint
ALTER TABLE `metas` ADD COLUMN `listed` integer DEFAULT 1 NOT NULL;

--> statement-breakpoint
UPDATE `info` SET `value` = '12' WHERE `key` = 'migration_version';
