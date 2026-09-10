ALTER TABLE `leonardo_activities` ADD `type` text DEFAULT 'activity' NOT NULL;--> statement-breakpoint
ALTER TABLE `leonardo_activities` ADD `content_markdown` text;