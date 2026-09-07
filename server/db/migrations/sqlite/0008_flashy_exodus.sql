CREATE TABLE `leonardo_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`date` integer NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "leonardo_activities_title_not_empty" CHECK(length(trim("leonardo_activities"."title")) > 0),
	CONSTRAINT "leonardo_activities_description_not_empty" CHECK(length(trim("leonardo_activities"."description")) > 0)
);
--> statement-breakpoint
CREATE INDEX `leonardo_activities_date_idx` ON `leonardo_activities` (`date`);