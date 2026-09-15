CREATE TABLE `benchmark_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`hardware` text NOT NULL,
	`memory_gb` integer NOT NULL,
	`score` integer NOT NULL,
	`model_count` integer NOT NULL,
	`decode_tps` real NOT NULL,
	`ttft_ms` real NOT NULL,
	`prefill_tps` real NOT NULL
);
