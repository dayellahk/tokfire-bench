# Local AI Benchmark Lab — implementation checkpoint

## Delivered in alpha 0.2

- SwiftUI executable package and `.app` assembly script for macOS 13+/Apple Silicon.
- Local llama-server runner, fixed two-workload/three-repetition protocol, strict short/cached/truncated-run rejection, per-model process cleanup, progress output, local report export.
- Report JSON contract with exact model/runtime content identities; median measurements and explicit timing definitions.
- Website imports reports entirely in the browser before upload and removes all fabricated hardware/score/leaderboard data from the original prototype.
- D1 structured storage, server-enforced collection consent, independent publication flag, stable account ownership, duplicate run protection, limited submission volume, same-origin mutation checks, bounded JSON input.
- Owner-only private listing, publication withdrawal, and deletion with measurement cascades.
- Database-backed community comparison groups for exact model/runtime/workload; no verified badges or uncalibrated overall scores.
- Source download and user-facing methodology.

## Authentication and privacy

The website uses Sites' dispatch-owned sign-in identity. No independent identity provider is introduced. Account IDs are retained in the private submissions table for ownership; emails are not stored. Public responses expose only opt-in aggregates and contain no account IDs or raw report timestamps. Neither imported JSON nor app output includes user prompts, generated text, model paths, model names or hardware serials.

Collection means retaining the allowlisted report in D1. Publication is an independent explicit choice. Changing a publication choice updates its timestamp. Deletion removes active report and measurement rows. Hosting infrastructure and backups have their own retention; visitors can retain previously published data. This is pseudonymous rather than fully anonymous.

The website remains owner-private. Choosing publication means eligibility for the comparison view; it does not change the site's audience. Customer rollout requires configured site access. The alpha client exports files and opens the website for authenticated upload. It cannot directly authenticate to a private Sites API, and no dispatch bypass secret is used.

## API

All mutating JSON endpoints require authenticated platform identity and reject cross-origin writes. Header trust relies on the hosting dispatcher: a standalone deployment must provide a trusted identity layer, not accept user-supplied identity headers.

| Endpoint | Behavior |
|---|---|
| `POST /api/v1/submissions` | `{report, consent:{collect:true,publish:boolean,version:"2026-09-15-v1"}}`; validates and atomically saves report + measurements; returns ID |
| `GET /api/v1/submissions` | Latest 100 records for authenticated owner only |
| `PATCH /api/v1/submissions/:id` | Owner only; `{publish:boolean,version:"2026-09-15-v1"}` |
| `DELETE /api/v1/submissions/:id` | Owner only; deletes report and cascading measurements |
| `GET /api/v1/leaderboard` | Opt-in comparison groups only; available subject to the site audience |
| `/api/results` | Legacy demo endpoint retired with HTTP 410 |

Maximum request body 200,000 bytes; up to 20 retained submissions per account in the previous hour. Rate limits are an alpha bound, not robust anti-abuse protection (deletion and concurrent submissions can weaken the quota). Unique run IDs and transactional inserts prevent replay inflation. Imported measurements remain unverified; format validation is not cryptographic attestation.

## Data model

Legacy `benchmark_results` is retained to avoid rewriting applied migrations and is not exposed. Migration 0001 adds `submissions` and `measurements`. `run_id` is unique. Measurement rows cascade on submission deletion. Indexes support owner/time listing, submission joins, and cohort queries.

Each report contributes three-run medians. Public comparisons average per-report medians, split by exact model hash, runtime binary hash/settings, specification, input/output lengths, and hardware/OS. CPU thread differences create different cohorts. Different runtime builds deliberately do not combine. Repeated reports can bias aggregates; contributor counts are displayed. Hashes do not attest linked dynamic library contents or prove actual GPU offload.

## Verification performed here

- Python protocol/validation tests: streamed token timing, short/cached/truncated results, exported-field privacy, atomic local writes, memory preflight and platform checks.
- Node tests using the actual generated SQLite migrations and repository methods: consent, private/public isolation, owner isolation, withdrawal, cascade deletion, duplicate rejection, transactional rollback, timing consistency, comparison-group separation, origin/auth guards.
- TypeScript type check, ESLint, production Worker build.

These are not browser E2E tests or real Apple Silicon performance tests. Native Swift compilation, Metal execution, macOS process behavior and signed distribution remain unverified in this Linux environment.

## Next release gates

1. Compile the Swift package on a Mac, run the exported report through the hosted website, and verify record creation/deletion as the owner.
2. Validate one pinned llama.cpp build on multiple Apple Silicon configurations; inspect Metal offload and validate timing/count behavior.
3. Add licensed model manifests, human-readable curated model names keyed by content identity, managed downloads, packaged runtime and direct native sign-in.
4. Measure swap, power and thermal behavior through platform-supported APIs; calibrate a fixed standard suite and reference scores separately from customizable model comparisons.
5. Add robust upload throttling/abuse controls, durable consent audit policy, aggregation safeguards and real-device validation for public launch.
6. Configure customer access, then sign/notarize release builds with the owner's Apple Developer identity.
