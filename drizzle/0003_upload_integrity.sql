CREATE TABLE IF NOT EXISTS run_challenges (
 id VARCHAR(36) PRIMARY KEY, run_id VARCHAR(36) NOT NULL UNIQUE,
 owner_id VARCHAR(191) NOT NULL, nonce VARCHAR(64) NOT NULL,
 config_json TEXT NOT NULL, issued_at BIGINT NOT NULL, expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS challenge_claims (
 challenge_id VARCHAR(36) PRIMARY KEY, run_id VARCHAR(36) NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS run_receipts (
 run_id VARCHAR(36) PRIMARY KEY, report_digest VARCHAR(64) NOT NULL, content_digest VARCHAR(64) NOT NULL
);
CREATE TABLE IF NOT EXISTS submission_integrity (
 submission_id VARCHAR(36) PRIMARY KEY, status VARCHAR(32) NOT NULL,
 reasons_json TEXT NOT NULL, checked_at BIGINT NOT NULL,
 FOREIGN KEY(submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS abuse_events (
 id VARCHAR(36) PRIMARY KEY, bucket VARCHAR(64) NOT NULL, created_at BIGINT NOT NULL
);
CREATE INDEX idx_abuse_bucket ON abuse_events(bucket);
CREATE INDEX idx_abuse_age ON abuse_events(created_at);
CREATE TABLE IF NOT EXISTS measurement_claims (
 content_digest VARCHAR(64) PRIMARY KEY
);
