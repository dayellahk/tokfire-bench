# Pro advanced tests — 0.9 preview

Mac, Windows and the Python CLI can run bounded parameter experiments on top of
TokFire's existing workloads. Free standard tests keep their fixed prompts,
settings and fingerprints. Advanced tests require a validated perpetual Pro
license, including when only one job is selected. Credentials travel over stdin,
not process arguments or reports. The source is public: this is application
licensing, not tamper-proof DRM.

## Workflow

1. Choose one model, runtime and workload.
2. Enable **Pro · Advanced tests**, then expand Sampling, Model runtime or Output
   and scenario. Windows uses **Adjust parameters…** for the same catalog.
3. Check the parameters to override and enter their values. Unchecked fields
   preserve benchmark/runtime defaults; displayed examples are not universal
   model defaults. Reset clears all overrides.
4. Run 3–5 repetitions, optionally with a concurrency sweep. Read task success
   and errors before comparing speed.
5. Export the local report and commentary. Advanced reports use
   `tokfire-advanced-v1`; they do not receive standard upload challenges, enter
   the automatic upload queue, or qualify for standard public rankings.

Public ranking validation already rejects this separate report specification.
This release does not add a public advanced-comparison database. Keep an unchanged
standard run as a baseline; compare experiments only with matching model, runtime,
workload, concurrency, budgets and configuration fingerprints.

## Implemented controls

The authoritative UI/validation catalog is
`native/Sources/LocalAIBench/Resources/advanced_parameters.json`.

- Sampling: temperature, top-K, top-P, min-P, repeat penalty/lookback,
  presence/frequency penalty, output limit, stop strings and seed.
- llama.cpp sampling extensions: typical-P, top-n sigma, dynamic temperature,
  DRY, XTC, Mirostat and sampler order. Ollama also exposes Mirostat.
- Benchmark-owned llama.cpp: per-slot context, GPU layers, server slots,
  batch/micro-batch size, CPU threads, K/V cache precision, Flash Attention,
  mmap/mlock, KV offload, RoPE, GPU weight split, a compatible draft GGUF and
  a named chat template. Ollama context is sent as `num_ctx`.
- Output/scenario: custom user/system prompts for chat workloads, llama.cpp
  GBNF, JSON schema on llama.cpp/Ollama/vLLM, and llama.cpp/vLLM logit bias.
- oMLX conservatively exposes temperature, top-P, output limit, stop strings
  and custom chat prompts. Other settings remain unavailable in this adapter.

Unsupported combinations are disabled in the UI and rejected in the runner.
Context and output limits are bounded (131072 and 32768 respectively); unlimited
outputs are intentionally unavailable for benchmarks. Quantized V cache requires
Flash Attention. Micro-batch cannot exceed batch size. Server slots cannot be
less than the tested jobs. Model memory estimates include the draft model, but
remain estimates rather than GPU allocation guarantees.

## Honest limits

These are **requested settings**, not independently verified effective settings.
Older API servers may ignore unsupported fields even when returning HTTP 200.
Record the runtime version separately and check its supported API before drawing
conclusions. Optional managed-runtime flags are checked against its `--help`;
startup failure stops the run. External servers are never restarted/reconfigured.

- vLLM tensor parallelism, memory utilization and server sequence limits must be
  configured on the user's external server; this release cannot tune them.
- Vision/mmproj requires a separate image workload and accuracy checks.
- N > 1 and beam search need a different multi-choice reporting contract.
- TFS-Z and a dedicated LM Studio adapter are not implemented.
- Selecting a GGUF file chooses weight quantization; this is not a runtime switch.
- Speculative decoding needs compatible target/draft models and runtime support;
  no fixed speedup is promised. Mixed-vendor GPU compatibility is not assumed.
- Temperature 0 and fixed seeds do not guarantee identical outputs across engines,
  versions, hardware or concurrent scheduling.
- Custom prompts can change difficulty. Throughput is not an answer-quality score.
  Agent task instructions cannot be replaced with custom prompts in this release.

Reports redact custom prompts, grammar/schema, stop strings, template values and
local draft paths, retaining hashes. Draft weights are hashed. Other numeric
settings are included. The temporary local configuration contains the original
text and is removed after the desktop runner exits; a crash may leave that local
file behind. No credentials or model output text enter the report.

## CLI

Save selected overrides in a JSON file, for example:

```json
{"temperature":0.3,"top_k":40,"top_p":0.9,"max_tokens":512}
```

Use `--advanced-config /path/to/settings.json` with `workload_runner.py`.
Supply the existing activated Pro credential JSON as the first stdin line.
Never put a license key in command arguments, documentation or shared reports.

## Availability

The UI can be previewed without a license, but running requires online validation.
The checked-in Lemon Squeezy product configuration remains unconfigured; paid
activation cannot go live until store/product/variant IDs are supplied and the
seller/product is ready. Android keeps its 0.7 profiles; it does not expose Pro
advanced tests yet. macOS remains ad-hoc signed pending Apple enrollment.

## Primary references checked during implementation

- llama.cpp: https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md
- Ollama: https://github.com/ollama/ollama/blob/main/docs/modelfile.mdx
- vLLM: https://docs.vllm.ai/en/stable/api/vllm/sampling_params/

## Validation for this preview

- 61 Python tests passed, including 10 advanced contract tests covering
  authorization, parameter ranges, engine mapping, runtime arguments, redaction
  and an end-to-end run against a controlled streaming fixture.
- 68 existing portal tests passed; the additional advanced-upload isolation test
  and the eight existing workload tests also passed. TypeScript and changed-file
  lint checks passed.
- Swift: 23 tests executed, 5 environment-dependent tests skipped, zero failures.
- Mac GUI: enabled advanced mode, expanded sampling controls and edited temperature;
  Pro-required messaging and local-only upload state were visible.
- Windows x64 release compilation and ZIP integrity checks passed. Interactive
  Windows/GPU validation remains pending.
- macOS DMG integrity/signature checks passed; it is still not Apple notarized.

Controlled fixtures are not hardware performance results. No synthetic reports
were uploaded. A real paid activation and a full real-model compatibility sweep
across runtime versions remain pending; requested settings must not be represented
as independently verified backend settings.
