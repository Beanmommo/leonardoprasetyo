CREATE TABLE `resume_ingestion_leases` (
	`lease_name` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`upload_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`upload_id`) REFERENCES `uploads`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "resume_ingestion_lease_name" CHECK("resume_ingestion_leases"."lease_name" = 'resume-publication')
);
--> statement-breakpoint
CREATE INDEX `resume_ingestion_leases_expires_idx` ON `resume_ingestion_leases` (`expires_at`);--> statement-breakpoint
ALTER TABLE `document_chunks` ADD `ingestion_id` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `uploads` ADD `ingestion_id` text;