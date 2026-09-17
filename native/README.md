## Installing on macOS

Open the DMG and drag **TokFire Bench** to **Applications**, then launch it from
Applications and eject the installer. The installation window includes a visual
arrow and English/Traditional Chinese instructions.

The current public preview is **not Apple notarized** and macOS may block it.
The new installer design does not change that signing status. A Developer ID
signed/notarized release is pending Apple Developer enrollment.
See [packaging and release signing](Packaging/README.md).

## Version 0.8 agent simulations

Choose CSV analysis, multi-page research or retry/idempotency in the workload menu. Results include verified artifact/state checks. These are TokFire simulations, not actual third-party agent integrations. See [the task definitions and limits](../docs/AGENT-SIMULATIONS.md).

# TokFire Bench 0.5.2 (macOS Apple Silicon)

A native SwiftUI benchmark lab with a live Hugging Face GGUF catalogue,
hardware capacity estimates, visible progress, local history, readable assessments,
and 20 UI languages (including Arabic/Urdu right-to-left layouts).

## Run locally

- Install Python 3.10+ and Metal-enabled llama.cpp for GGUF tests.
- For MLX, install oMLX and download an MLX model folder separately.
- Build with `bash build-app.sh`; create the disk image with `bash build-dmg.sh`.
- Choose **llama.cpp + GGUF** or **oMLX + MLX** in the benchmark workspace.
- oMLX starts a separate loopback instance with temporary settings and cache disabled.
  Existing oMLX service, API key, model settings and caches are not modified.
- Choose the folder containing `config.json` and `.safetensors` files, not its parent.

## Measurement profiles

- `local-ai-jobs-v1` (default): choose one model and 1–3 concurrent jobs, or
  up to 20 with Pro. Three rounds, up to 128 output tokens per job.
  GGUF uses exactly 512 input tokens; MLX uses server-counted variable input.
- `local-ai-text-v1` (optional standard profile): exact 512/2048 input tokens, 128 output tokens, 3 measured runs
  per workload plus discarded warm-ups. Selected GGUFs run sequentially.
- `local-ai-trial-v1`: one GGUF, 512 input/32 output, one measured run.
- `local-ai-omlx-v1` (legacy history compatibility): MLX text-completion serving workload, max 128 output tokens,
  actual server-reported input/output counts, 1/2/3 concurrent requests × 3 rounds,
  one discarded warm-up. 18 measured requests. Cache hits and incomplete streams fail.
  oMLX decode/prefill rates come from usage; first-text latency and end-to-end rates
  are client timings. Aggregate throughput uses actual group makespan.
  Total startup plus discarded warm-up is reported as load/warm-up time.

These profiles are separate. oMLX results do not enter the exact-token llama.cpp
leaderboard. Output may stop before 128 tokens; actual counts and finish reason
remain in the report. Model manifest hashes cover weights, configuration and tokenizer.
Runtime identity records the selected executable/launcher fingerprint. The
legacy oMLX profile also includes version text. Neither fingerprint attests
the full runtime installation or dynamically loaded libraries.

The 100–200 tok/s target is user-selected, **not a measured/guaranteed ChatGPT plan
speed**. Assessments also consider first-text wait. For concurrent tests, the
slowest sampled request determines target attainment. These short bursts do not
prove long-running server capacity, answer quality, or every family workload.

## Storage and upload

JSON and Markdown reports are saved in:
`~/Library/Application Support/LocalAIBench/Reports/`

Automatic upload is ON by default and visible before Run. Public sharing is a
separate switch, OFF by default. Connect the website account once in the app.
Reports contain hardware, runtime/model fingerprints, model name in serving/job profiles, timing
and concurrency measurements. Prompts, generated text and local paths are excluded.
Failed/offline uploads remain in a local Outbox. Turning upload off prevents queued
uploads from starting; an already-sent request cannot be recalled. Clear the queue
to discard pending uploads, or delete saved records in the website's My data page.
Trials are stored separately from standard comparisons.

## External reference data

`../data/omlx-reference.json` contains an attributed **partial snapshot**: latest
10 pages/100 records from each public oMLX board at its recorded fetch time.
The performance source's default filter excludes SpecPrefill, not all accelerators.
Intelligence records identify author/model/task/score/sample coverage, not hardware.
Re-fetch with `python scripts/import-omlx.py` from the project root, deploy, then
open the authenticated reference page; it imports automatically. Its refresh button can retry. The importer is bounded and
idempotent, preserves source links/notes, and never treats external scores as local runs.

## Validation

- `swift test` for native unit tests.
- `LOCALAI_TEST_SITE=1 swift test --filter UploadTests` with local site on port 5173
  for real WKWebView login, upload, database read and owner deletion.
- `python -m unittest discover -s Tests -v` for runner/protocol/cleanup tests.
- `python Packaging/smoke-gui.py` for opt-in real GUI GGUF lifecycle tests.
- Set `LOCALAI_ENGINE=omlx` for real MLX lifecycle tests with the installed test model.
- `--capture-directory /path` records the app's own view for QA without screen access.

Developer distribution only: the DMG is ad-hoc signed, not Developer ID signed or
notarized. It bundles neither inference runtimes nor model weights. UI translations
are initial translations; professional/native-speaker review remains advisable.
Technical logs and website sign-in retain their own language.


## Concurrent jobs and Lemon Squeezy Pro (0.5)

Choose one model, then select 1, 2 or 3 simultaneous jobs before Run. Both
llama.cpp/GGUF and oMLX/MLX use one isolated model server. Jobs share that
model; this is not a count of people or distinct models. Each measured round
starts all selected requests together, repeated three times. The runtime may
schedule or queue requests; TTFT includes that waiting. The older standard
GGUF sequential profile remains available by switching off Concurrent job test.

The new `local-ai-jobs-v1` report records job IDs, model hash, engine, selected
count, three rounds and aggregate throughput. Reports from different counts
must not be combined into a single comparison. Progress and commentary show
individual jobs as well as the slowest sample. Pro does not guarantee a speed,
GPU parallelism, or enough memory for 20 jobs.

Pro is a one-time HK$180 purchase using Lemon Squeezy license keys, unlocking
4–20 concurrent jobs on the same model. One license activates one Mac. Activation and each Pro test require
internet verification. Keys are stored in macOS Keychain, sent only to Lemon Squeezy,
and passed to the local runner over stdin (not argv or reports). The runner
independently validates the active license instance, exact store/product/variant,
and perpetual expiry. Seller-side refund handling must disable the license.
Deactivation releases this Mac’s activation instance. Offline use remains available for 1–3 free jobs.

Lemon Squeezy product configuration is in `Sources/LocalAIBench/Resources/lemon-squeezy.json`.
Zero store/product/variant IDs disable purchases and activation; it never unlocks Pro.
See `../docs/LEMON-SQUEEZY-SETUP.md` for the seller setup and outstanding live checks.

Brand: TokFire. Company: TokFire Labs. Domain: tokfires.com (DNS setup pending).
The existing Application Support/LocalAIBench path, Keychain service and module names are retained for upgrade compatibility.


**16 September 2026 update:** External reference tables and raw-data APIs are now
retired from the public portal. Earlier reference-display validation in this file
is historical. Only consented TokFire results and local report previews remain
publicly available; internal reference datasets are excluded from source downloads.
