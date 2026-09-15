import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const benchmarkResults = sqliteTable("benchmark_results", { id: integer("id").primaryKey({ autoIncrement: true }), createdAt: integer("created_at", { mode: "timestamp" }).notNull(), hardware: text("hardware").notNull(), memoryGb: integer("memory_gb").notNull(), score: integer("score").notNull(), modelCount: integer("model_count").notNull(), decodeTps: real("decode_tps").notNull(), ttftMs: real("ttft_ms").notNull(), prefillTps: real("prefill_tps").notNull() });

// Legacy demo table above is retained but never exposed through the v1 API.
// Previously applied migrations are immutable.
import { index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const submissions = sqliteTable('submissions', {
  id: text('id').primaryKey(), runId: text('run_id').notNull(), ownerId: text('owner_id').notNull(),
  collectedAt: integer('collected_at').notNull(), consentVersion: text('consent_version').notNull(),
  isPublic: integer('is_public').notNull().default(0), publicationChangedAt: integer('publication_changed_at').notNull(),
  reportJson: text('report_json').notNull(),
}, t => [uniqueIndex('idx_submissions_run_id').on(t.runId), index('idx_submissions_owner_time').on(t.ownerId, t.collectedAt)]);
export const measurements = sqliteTable('measurements', {
  id: text('id').primaryKey(), submissionId: text('submission_id').notNull().references(() => submissions.id, {onDelete: 'cascade'}),
  cohort: text('cohort').notNull(), modelHash: text('model_hash').notNull(), inputTokens: integer('input_tokens').notNull(),
  chip: text('chip').notNull(), machine: text('machine').notNull(), cpuCores: integer('cpu_cores').notNull(),
  memoryBytes: integer('memory_bytes').notNull(), osVersion: text('os_version').notNull(), runtimeHash: text('runtime_hash').notNull(),
  decodeTps: real('decode_tps').notNull(), ttftMs: real('ttft_ms').notNull(), prefillTps: real('prefill_tps').notNull(),
  peakRssBytes: integer('peak_rss_bytes'), loadMs: real('load_ms').notNull(),
}, t => [index('idx_measurements_submission').on(t.submissionId), index('idx_measurements_cohort').on(t.cohort)]);
