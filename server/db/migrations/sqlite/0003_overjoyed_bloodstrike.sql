CREATE TABLE `document_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`upload_id` text NOT NULL,
	`vector_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`page_number` integer NOT NULL,
	`text_content` text NOT NULL,
	`char_start` integer,
	`char_end` integer,
	`token_count` integer,
	`content_hash` text NOT NULL,
	`embedding_model` text NOT NULL,
	`embedding_dimensions` integer NOT NULL,
	`indexed_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`upload_id`) REFERENCES `uploads`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "document_chunks_chunk_index_nonnegative" CHECK("document_chunks"."chunk_index" >= 0),
	CONSTRAINT "document_chunks_page_positive" CHECK("document_chunks"."page_number" > 0),
	CONSTRAINT "document_chunks_dimensions_positive" CHECK("document_chunks"."embedding_dimensions" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_chunks_vector_idx` ON `document_chunks` (`vector_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `document_chunks_upload_chunk_idx` ON `document_chunks` (`upload_id`,`chunk_index`);--> statement-breakpoint
CREATE INDEX `document_chunks_upload_page_idx` ON `document_chunks` (`upload_id`,`page_number`,`chunk_index`);--> statement-breakpoint
CREATE TABLE `question_usage` (
	`usage_date_utc` text NOT NULL,
	`ip_hash` text NOT NULL,
	`question_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`usage_date_utc`, `ip_hash`),
	CONSTRAINT "question_usage_count_range" CHECK("question_usage"."question_count" >= 0 AND "question_usage"."question_count" <= 5)
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text DEFAULT 'portfolio-admin' NOT NULL,
	`r2_key` text NOT NULL,
	`original_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`checksum_sha256` text NOT NULL,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`error_message` text,
	`is_public` integer DEFAULT true NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`page_count` integer,
	`vector_mutation_id` text,
	`indexed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "uploads_size_nonnegative" CHECK("uploads"."size_bytes" >= 0),
	CONSTRAINT "uploads_page_count_nonnegative" CHECK("uploads"."page_count" IS NULL OR "uploads"."page_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uploads_r2_key_idx` ON `uploads` (`r2_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `uploads_checksum_idx` ON `uploads` (`checksum_sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `uploads_one_active_idx` ON `uploads` (`is_active`) WHERE "uploads"."is_active" = 1;--> statement-breakpoint
CREATE INDEX `uploads_public_status_idx` ON `uploads` (`is_public`,`status`,`is_active`);--> statement-breakpoint
CREATE INDEX `uploads_created_idx` ON `uploads` (`created_at`);