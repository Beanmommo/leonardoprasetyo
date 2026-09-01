DROP INDEX `uploads_one_active_idx`;--> statement-breakpoint
ALTER TABLE `uploads` ADD `role` text DEFAULT 'document' NOT NULL;--> statement-breakpoint
UPDATE `uploads`
SET `role` = 'resume'
WHERE `r2_key` LIKE 'library/public/resume/%';--> statement-breakpoint
UPDATE `uploads`
SET `status` = 'deleted',
	`is_active` = 0
WHERE `role` = 'resume'
	AND `status` <> 'deleted'
	AND `id` <> (
	SELECT `id`
	FROM `uploads`
	WHERE `status` <> 'deleted'
		AND `role` = 'resume'
	ORDER BY `is_active` DESC, `updated_at` DESC
	LIMIT 1
);--> statement-breakpoint
CREATE UNIQUE INDEX `uploads_one_resume_idx` ON `uploads` (`role`) WHERE "uploads"."role" = 'resume' AND "uploads"."status" <> 'deleted';--> statement-breakpoint
CREATE INDEX `uploads_role_status_idx` ON `uploads` (`role`,`status`,`is_active`);
