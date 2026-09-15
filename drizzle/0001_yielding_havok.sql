CREATE TABLE `measurements` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`cohort` text NOT NULL,
	`model_hash` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`chip` text NOT NULL,
	`machine` text NOT NULL,
	`cpu_cores` integer NOT NULL,
	`memory_bytes` integer NOT NULL,
	`os_version` text NOT NULL,
	`runtime_hash` text NOT NULL,
	`decode_tps` real NOT NULL,
	`ttft_ms` real NOT NULL,
	`prefill_tps` real NOT NULL,
	`peak_rss_bytes` integer,
	`load_ms` real NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_measurements_submission` ON `measurements` (`submission_id`);--> statement-breakpoint
CREATE INDEX `idx_measurements_cohort` ON `measurements` (`cohort`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`collected_at` integer NOT NULL,
	`consent_version` text NOT NULL,
	`is_public` integer DEFAULT 0 NOT NULL,
	`publication_changed_at` integer NOT NULL,
	`report_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_submissions_run_id` ON `submissions` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_submissions_owner_time` ON `submissions` (`owner_id`,`collected_at`);