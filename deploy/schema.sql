CREATE TABLE IF NOT EXISTS submissions (
 id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 run_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 owner_id VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 collected_at BIGINT NOT NULL, consent_version VARCHAR(80) NOT NULL,
 is_public TINYINT NOT NULL DEFAULT 0, publication_changed_at BIGINT NOT NULL,
 report_json LONGTEXT NOT NULL,
 INDEX idx_submissions_owner_time(owner_id,collected_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS measurements (
 id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 submission_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 cohort VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 model_hash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 input_tokens INT NOT NULL, chip VARCHAR(80) NOT NULL, machine VARCHAR(80) NOT NULL,
 cpu_cores INT NOT NULL, memory_bytes BIGINT NOT NULL, os_version VARCHAR(40) NOT NULL,
 runtime_hash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 decode_tps DOUBLE NOT NULL, ttft_ms DOUBLE NOT NULL, prefill_tps DOUBLE NOT NULL,
 peak_rss_bytes BIGINT NULL, load_ms DOUBLE NOT NULL,
 FOREIGN KEY(submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
 INDEX idx_measurements_submission(submission_id), INDEX idx_measurements_cohort(cohort)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS external_benchmarks (
 id VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 kind VARCHAR(32) NOT NULL, source_url TEXT NOT NULL, fetched_at VARCHAR(40) NOT NULL,
 coverage TEXT NOT NULL, row_json LONGTEXT NOT NULL, INDEX idx_external_kind(kind)
) ENGINE=InnoDB;
