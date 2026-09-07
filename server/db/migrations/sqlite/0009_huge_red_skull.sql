PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_leonardo_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`date` integer NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "leonardo_activities_title_not_empty" CHECK(length(trim("__new_leonardo_activities"."title")) > 0)
);
--> statement-breakpoint
INSERT INTO `__new_leonardo_activities`("id", "date", "title", "description", "created_at", "updated_at") SELECT "id", "date", "title", "description", "created_at", "updated_at" FROM `leonardo_activities`;--> statement-breakpoint
DROP TABLE `leonardo_activities`;--> statement-breakpoint
ALTER TABLE `__new_leonardo_activities` RENAME TO `leonardo_activities`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `leonardo_activities_date_idx` ON `leonardo_activities` (`date`);