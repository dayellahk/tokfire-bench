# Guest upload integrity — 0.7 build 11

## Flow

Online app → guest cookie → POST /api/v2/challenges → local inference → POST /api/v2/submissions → MySQL transaction → private report / consented community rankings.

No account is required. Turning upload off makes the run local-only. If the challenge service is unreachable, the app still runs; later uploads are **community-unverified**, never silently upgraded. Legacy report formats remain supported without a challenge.

## Implemented checks

- Each ticket has a server-generated run UUID, 256-bit nonce, guest/account owner, selected workload/runtime/model identifier, concurrency levels and repeat count. It expires after 24 hours.
- The runner includes nonce/run/round/job identifiers in the actual prompt. Agent order prices also vary deterministically with the server nonce; lookup → sum → answer remains the bounded workflow. Nonce agent fixtures have a separate comparison cohort from older fixed fixtures.
- The server checks ticket ownership, run/configuration, the request identifier digest, timing consistency and elapsed server time. Expired tickets or implausible elapsed windows are saved privately for review.
- Submission, measurements, integrity status, replay receipt and single-use ticket claim commit in **one transaction**. Unique constraints resolve concurrent attempts. An identical same-owner retry returns an acknowledgement; changed contents/ownership return 409.
- Measurement digests exclude run ID, timestamp and challenge, so relabelling identical measurements is rejected. Receipts survive deletion. They do not block sophisticated fabrication of new numbers.
- Per UTC clock hour: 30 upload attempts and 20 ticket attempts per owner; 120 per action per source IP across owners. These are durable attempt counters, independent of report deletion. A 429 leaves native reports queued. Shared networks share the IP budget.
- The trusted Nginx proxy overwrites X-TokFire-Client-IP. Only Cloudflare's configured published CIDRs may supply CF-Connecting-IP. Node binds to loopback. HMAC-hashed, hourly IP buckets use a server-only secret; no IP enters a benchmark report.
- Existing strict allowlists check complete repeats/jobs, token/time arithmetic, aggregate throughput, runtime identity attribution and bounded tool completion. Throughput over 10,000 decode or end-to-end tokens/s per request triggers review, **not a fraud accusation**. Slow/failed tasks remain valid observations.
- Quarantined rows are filtered in SQL from both public feeds, including after a user requests publication. The owner can see the review state, withdraw publication or delete the report. Native upload acknowledgement distinguishes saved-for-review from an upload failure.

## Honest trust labels

**Community unverified:** format checks passed, no server ticket.

**Challenge checked:** one-time ticket and consistency checks passed. Hardware, model identity and actual execution are still client-reported. A modified client can compute hashes and fabricate plausible timing. There is no shared signing secret in the app and no claim of hardware attestation.

**Quarantined:** privately stored for review; excluded from rankings regardless of publication preference.

There is no automatic “TokFire verified” label. Controlled verification needs a separate witnessed run and provenance process. Cross-device outlier calibration is not enabled: current private results from one Mac cannot establish independent baselines. An IP/guest cookie is not an independent physical device.

## Retention and review

Deletion removes report JSON, measurements and integrity metadata. Minimal run IDs, one-way report/measurement digests and consumed-ticket IDs remain to block replay; they contain no owner ID, prompts or raw hardware. Ticket configuration/owner records expire from storage seven days after their 24-hour validity ends. Abuse attempts expire after two hours. Cleanup currently runs on the next protected request, so an idle service retains expired rows until that request.

Review is an operator action, not a client-provided field. Inspect the owner's quarantined row and `reasons_json`, request a fresh run when needed, and document independent evidence before any release. Do not upgrade it to hardware-verified. No self-service publication action bypasses quarantine.

## Deployment

Run `node --experimental-strip-types deploy/migrate-integrity.mjs` with the existing DATABASE_URL. It adds tables and backfills replay receipts without changing existing report contents, ownership or publication consent. Set BENCH_TRUST_PROXY=1 only behind the configured proxy, and provide BENCH_RATE_SECRET (server-only random secret; BETTER_AUTH_SECRET is a fallback).

Checks: backend replay/expiry/owner/config/rollback/quarantine/quota tests; Python nonce prompt and randomized agent fixture tests; real local model → native WebKit guest upload integration; macOS DMG, Windows cross-build and Android APK build. Build success is not equivalent to physical Windows/Android device testing.
