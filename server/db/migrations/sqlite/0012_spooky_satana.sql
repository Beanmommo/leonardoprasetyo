CREATE TABLE `activity_feed_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`dates_normalized` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
DROP INDEX `leonardo_activities_order_idx`;--> statement-breakpoint
CREATE INDEX `leonardo_activities_day_order_idx` ON `leonardo_activities` ("date" desc,`order`,`id`);--> statement-breakpoint
INSERT INTO `activity_feed_state` (`id`) VALUES (1);--> statement-breakpoint
-- Cursor positions remain valid across inserts/deletes and content edits.
-- Moving an existing item (including its calendar day) invalidates old cursors.
CREATE TRIGGER `leonardo_activities_position_changed`
AFTER UPDATE OF `date`, `order` ON `leonardo_activities`
WHEN OLD.`date` <> NEW.`date` OR OLD.`order` <> NEW.`order`
BEGIN
  UPDATE `activity_feed_state` SET `revision` = `revision` + 1 WHERE `id` = 1;
END;
