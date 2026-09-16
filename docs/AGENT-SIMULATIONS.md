# Agent simulations — TokFire Bench 0.8

These are implemented, bounded model-and-tool workflows, not brand-specific agent integrations. They measure whether a local model can complete useful miniature tasks through JSON tool actions. They do not run Hermes, OpenClaw, Pi, Claude Code or Codex, execute generated code, browse the live internet, or claim general autonomous reliability.

## Tasks

| Profile | Work performed | Deterministic validation |
| --- | --- | --- |
| agent-data | Read an actual synthetic CSV, exclude cancelled/missing-quantity rows, write a JSON report | Source read, artifact exists, included/excluded counts, integer-cent total, regional totals |
| agent-research | Fetch three local HTML snapshots, find the cheapest eligible plan, write a sourced report | All sources fetched, report exists, eligibility and price, exact evidence from each page |
| agent-recovery | Read a request, recover from an inventory error and ambiguous post-commit timeout, check receipt, write report | Same-key retry, exactly one reservation, correct stock, receipt read, correct artifact |

Each job receives its own temporary directory and seeded fixture variant. Read/write paths and tool arguments are allowlisted. No subprocess, shell, arbitrary filesystem access or network tools are exposed to generated actions. Temporary files are removed after completion, error or cancellation. Reports contain check IDs/booleans and retry counts; prompts, outputs, documents, paths and credentials remain excluded.

The simulation harness source hash forms part of each workload fingerprint. Original 0.7 profiles retain their existing hashes and remain readable. The upload API requires the exact check list and internally consistent completion evidence for 0.8 profiles. These are consistency checks, not cryptographic proof that a community uploader actually executed the model.

## Running and interpreting

Choose a new profile in the Mac/Windows workload selector or use the Python runner:

```sh
python3 workload_runner.py --engine Ollama --endpoint http://127.0.0.1:11434 \
  --model YOUR_LOCAL_MODEL --workload agent-data --jobs 3 --sweep --repeats 3 \
  --timeout 180 --output agent-data.json
```

Free supports 1–3 concurrent jobs calling the same model; existing Pro limits remain unchanged. Every measured job is retained, including failures and timeouts. Up to 12 model responses are permitted per task. For new profiles, the timeout covers the whole task across model calls and tools. One entire warm-up task is excluded; its task timeout does not abort subsequent measurements. Transport/protocol warm-up errors still fail preflight.

Read completion rate and passed checks first, then total task latency and recovery/tool-error counts. Intentional service errors are not model protocol errors. A model may recover from an invalid tool call and eventually finish; that completed task retains the error count. The existing A/B interaction grades still require zero protocol errors and complete per-request decode/visible-latency metrics. Missing decode metrics mean unclassified interaction speed, not that a verified task failed. Task success is displayed independently. Runtime token counts and timings are never inferred from character counts.

Compare only matching workload fingerprints, budgets, context, runtime/model identities and tested concurrency levels. Seeded fixture instances differ across jobs to reduce constant-answer shortcuts. Fixed small tasks are a reproducible proxy, not a validated predictor of all real-world jobs. Three to five repetitions are descriptive, not a reliability guarantee. Cloud inference must not be ranked as local hardware capability.

## Coverage and next validation layer

Desktop Mac, Windows source and Python runner expose these profiles. The native Android 0.7 APK retains the original four profiles. True agent adapters, coding-repository tasks, live browser behavior, persistent agent memory, native API function-calling fidelity, energy and long-running reliability are not implemented by this release.

Actual-agent integration should pin the agent version, model endpoint and tools, reset memory/workspaces, and run held-out tasks with the same outcome checks. This is the next layer needed to determine how strongly these simulations predict Hermes/OpenClaw/Pi/Claude Code/Codex performance.

Aggregate throughput counts reported tokens from fully measured requests over whole-round time. Tokens from incomplete streams cannot be counted reliably and are excluded; this is not a complete delivered-token count when streams fail.
