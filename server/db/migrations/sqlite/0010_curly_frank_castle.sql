DROP INDEX `leonardo_activities_date_idx`;--> statement-breakpoint
ALTER TABLE `leonardo_activities` ADD `order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Initialize the saved order once, with the newest-created activities on top.
WITH ranked AS MATERIALIZED (
  SELECT `id`, ROW_NUMBER() OVER (ORDER BY `created_at` DESC, `id` DESC) - 1 AS position
  FROM `leonardo_activities`
)
UPDATE `leonardo_activities`
SET `order` = (SELECT position FROM ranked WHERE ranked.id = `leonardo_activities`.`id`);--> statement-breakpoint
CREATE INDEX `leonardo_activities_order_idx` ON `leonardo_activities` (`order`);
