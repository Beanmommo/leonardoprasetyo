CREATE TABLE `indexing_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`upload_id` text NOT NULL,
	`workflow_instance_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`stage` text DEFAULT 'queued' NOT NULL,
	`progress_current` integer DEFAULT 0 NOT NULL,
	`progress_total` integer,
	`page_count` integer,
	`chunk_count` integer,
	`embedding_model` text,
	`embedding_dimensions` integer,
	`extraction_method` text,
	`attempt` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`upload_id`) REFERENCES `uploads`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "indexing_tasks_progress_current_nonnegative" CHECK("indexing_tasks"."progress_current" >= 0),
	CONSTRAINT "indexing_tasks_progress_total_nonnegative" CHECK("indexing_tasks"."progress_total" IS NULL OR "indexing_tasks"."progress_total" >= 0),
	CONSTRAINT "indexing_tasks_attempt_nonnegative" CHECK("indexing_tasks"."attempt" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `indexing_tasks_workflow_instance_idx` ON `indexing_tasks` (`workflow_instance_id`);--> statement-breakpoint
CREATE INDEX `indexing_tasks_status_created_idx` ON `indexing_tasks` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `indexing_tasks_upload_created_idx` ON `indexing_tasks` (`upload_id`,`created_at`);
