CREATE TABLE `external_benchmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`source_url` text NOT NULL,
	`fetched_at` text NOT NULL,
	`coverage` text NOT NULL,
	`row_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_external_kind` ON `external_benchmarks` (`kind`);