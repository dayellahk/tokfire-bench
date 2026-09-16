# TokFire Match v1 — recommendation equation and data design

Design date: 16 September 2026. **Design proposal, not a calibrated production
predictor.** The shipped TokFire fit v1 A/B/C/D/U grades remain measured-report
grades. No external numbers, inferred grades or synthetic examples have been
published to the community database.

## Product answer

For one hardware configuration, one exact model artifact, one runtime, one workload
and a requested job count, return:

- memory fit: fits / tight / does not fit / unknown;
- predicted per-job decode and first-visible latency ranges, when supportable;
- chat suitability, tool-workflow suitability and supported job counts separately;
- evidence: measured locally / matched measurements / model estimate / insufficient;
- confidence: low / medium / high with reasons and data age;
- recommendation: try this configuration, reduce context/jobs, or run a local test.

The public portal must not reproduce external rows, raw JSON, source leaderboards
or hidden downloadable copies. Internal provenance remains attached to every
observation. Required dataset attribution belongs in appropriate credits when a
licensed dataset is actually used; hiding a table does not remove those duties.
Sources with unresolved reuse terms do not enter the released recommendation model.
No external estimate may create an A/B/C measured badge.

## 1. Sources reviewed and admission decisions

| Source | Useful evidence | Decision for first version |
|---|---|---|
| [oMLX performance](https://omlx.ai/benchmarks/performance) and [intelligence](https://omlx.ai/benchmarks/intelligence) | Existing internal snapshot separates performance and intelligence. It lacks the full TokFire per-job/tool workflow evidence. | Private research only until reuse terms and metric definitions are verified. Never convert intelligence scores into concurrent-agent capacity. No public raw endpoints. |
| [AIDataTools macOS results](https://llm.aidatatools.com/results-macos.php) | Hardware, RAM, OS, Ollama version, model tag and throughput columns. | Candidate speed evidence. Do not assume quantization, context, jobs, or first-visible timing from a model tag. Resolve those from original reports before exact cohort admission. The tool's MIT license alone does not establish permission for all hosted submissions. |
| [Anubis](https://github.com/uncSoft/anubis-oss) and its [author's forum description](https://discuss.huggingface.co/t/anubis-oss-local-llm-benchmarking-for-apple-silicon-with-real-time-hardware-telemetry-looking-for-testers-open-data/173753) | Runtime timing, cold/warm handling, memory/power/thermal telemetry and methodology versioning. Current README describes corrections to older timing calculations. | Prefer current server-verified observations; quarantine old/unknown measurement versions. Repo code is GPL-3.0; do not copy implementation into TokFire. Independently confirm dataset reuse terms. Forum post is context, not a second dataset. |
| [ModelFit dataset](https://modelfit.io/data/) | Artifact/catalog and estimated memory requirements; offers JSON export with CC BY 4.0 attribution. | Candidate memory/catalog prior, explicitly tagged estimated. Verify model artifacts and metadata against their original model repositories. Never count ModelFit estimates as independent measured speed evidence or treat its recommendation as ground truth. |
| [Apple Silicon LLM Bench](https://github.com/john-rocky/apple-silicon-llm-bench) and [fairness rules](https://github.com/john-rocky/apple-silicon-llm-bench/blob/main/methodology/fairness-rules.md) | Stored sessions, explicit artifacts and quantization, thermal state, separate protocols and cold/warm runs. | Candidate reproducible observations within compatible cohorts. Preserve session boundaries and failed runs. Repo reports MIT; confirm applicable artifact notices before ingestion. Do not form runtime ratios across unrelated sessions. |
| [LlamaBuilds benchmarks](https://www.llamabuilds.ai/benchmarks) | Potential PC build/GPU/VRAM, speed and memory coverage. | **Excluded from numerical fitting now.** On review, the page warns that its data model is being updated and asks readers to disregard placeholder values. Reconsider only when real measurements, methodology and reuse terms are available. |

These are admission decisions, not claims that the feeds have been imported or
licensed. The latest source review used read-only access. No bulk ingestion or
source-code copying was performed.

## 2. Comparable observations first

Exact cohort key:

```
model repository + revision + artifact hash + quantization recipe
runtime + runtime version + backend/device placement
hardware chip/GPU configuration + usable memory + OS
workload revision + prompt/output budgets + context + KV type
jobs + batching/cache mode + warm/cold regime + timing definition
```

Keep total vs active parameters separate for MoE. Keep GGUF Q4_K_M, MLX affine
4-bit, group sizes and mixed precision separate. A model name, chip name or
"4-bit" label alone is insufficient for an exact match. GPU VRAM and system RAM
are separate pools unless the architecture is unified; do not sum unrelated GPUs
without a tested sharding plan. Client hardware cannot stand in for a remote
inference server's hardware.

Normalize units to bytes, seconds, tokens and watts internally. Decode rate,
end-to-end output rate, prefill rate, first-token and first-visible latency are
different metrics. Reasoning tokens count as computation but may not be visible.
Do not infer first-visible latency from a source's first-token field.

Deduplicate original run/session IDs and cross-posts before aggregation. Multiple
uploads of the same run are one observation. Retain failed/OOM/timeout results in
the denominator. Unknown fields stay null, never zero or optimistic defaults.

## 3. Memory equation — the first gate

All quantities below use bytes. For **one resident model** serving n jobs:

```
B       = min(runtime allocation limit, currently available memory - safety reserve)
R(n,C)  = Wresident + Oruntime + n × [KV(C) + Ojob]
Headroom = (B - Rupper(n,C)) / B
```

`B` must be positive and use the actual inference memory pool. If only installed
RAM is known, use a conservative configurable OS/app reserve and label the budget
estimated. Do not subtract used memory twice when using an available-memory probe.
`Rupper` is a calibrated upper prediction bound; until calibrated, show a stated
engineering range, not a statistical confidence bound.

Preferred `Wresident`: matched peak allocation measurements with their definition.
Fallback: artifact tensor bytes + explicitly estimated runtime expansion. Parameter
count × nominal bits / 8 is only a rough lower approximation; metadata, scales,
mixed precision and non-weight buffers matter. For a 35B-A3B MoE, resident weights
are based on all stored experts, **not 3B active parameters**.

For a conventional attention layer family, a first-order KV estimate is:

```
KV(C) = 2 × layers × KV_heads × head_dimension × C × bytes_per_KV_element
```

Sum per-layer terms when architectures vary. Add quantization metadata, allocation
rounding and cache overhead. Sliding-window layers use their actual retained
length. MLA, recurrent/hybrid models and shared/paged caches require their own
adapter or measured allocation; do not apply the generic formula blindly. `C`
is retained prompt + generated context per job, not the model's maximum advertised
window. Prefix sharing gets no discount until verified for that runtime.

`Wresident` is counted once only if jobs share the model server. Multiple processes
may replicate weights; that execution topology needs a different equation.

- Rupper <= 0.8 B: comfortable memory estimate.
- 0.8 B < Rupper <= B: tight; reduce context/jobs or validate locally.
- Rupper > B: reject the configuration for this memory pool.
- Missing architecture/allocation information: unknown, not "fits".

The 20% headroom policy is a conservative product setting, not a physical constant.

## 4. Speed and latency prediction

### Matched observations

Do not average displayed leaderboard scores. Within a compatible cohort, summarize
independent device-session medians. Fit in log space to keep predictions positive:

```
y_i = log(per-job decode tok/s_i)
y_i = f_theta(hardware, artifact, runtime, context, jobs, workload) + session_error
```

A practical sparse-data baseline is a weighted median of compatible `y_i`.
Weights reflect verified metric coverage, measurement age and match distance, with
equal total weight per independent device/session and a cap per source. Record all
weight choices in a versioned manifest; tune decay and similarity on held-out data,
not by assigning a favored website a bigger score. Do not merge unrelated runtime
versions or protocols merely to obtain a larger sample.

When exact records are absent, a physics-informed prior may use:

```
T1_prior = eta × min(effective_memory_bandwidth / bytes_read_per_token,
                     effective_compute / operations_per_token)
```

Both terms have units tokens/second. `eta`, effective bytes and effective compute
must be calibrated by model family, quantization and runtime. Nominal chip bandwidth
or MoE active parameters alone cannot deliver a precise tokens/sec estimate. Without
calibration, return "needs local benchmark" rather than a fabricated precise speed.

### Parallel jobs

Model per-job speed and latency at each tested n. A possible fitted interpolation is:

```
Tjob(n) = Tjob(1) / [1 + a × (n - 1)^b],  a >= 0, b > 0
```

This is a candidate curve, not a universal law. Fit only to synchronized concurrency
sweeps for this runtime/model/context. If real batching behavior is not monotone,
use observed levels or a different validated model. A single-job observation cannot
identify a or b. Do not assume T1/n is a measured bound, and do not extrapolate a
1–3 job sweep to 20 jobs. Total throughput is distinct from each job's speed.

For diagnostics, first-visible latency can be decomposed as:

```
Lvisible = Lqueue + Lload_if_cold + Lprefill + Lreasoning_before_visible + Lstream
```

If any essential component is unknown and no directly comparable visible-latency
measurement exists, the latency prediction is unknown. Fit latency separately from
decode. Predict task completion time using workload steps and actual dependencies;
agent tool-call chains are not one flat token stream.

Prediction intervals must come from held-out device/session residuals, with separate
coverage checks for runtime, hardware class and job count. Use grouped bootstrap or
split-conformal calibration only with enough independent groups. Until that check
passes, call the range an estimate and show low confidence; never claim a 90/95%
coverage guarantee from a small set of repeats.

## 5. A transparent recommendation score

First apply gates: local artifact exists; runtime supports it; memory fits; eligible
source rights; adequate metric definitions. Unsupported configurations are excluded.
Missing inputs produce "insufficient evidence", not a zero-quality model.

For a configuration with enough information, define normalized factors:

```
v = min(1, T_lower_per_job / T_target)
l = min(1, L_target / L_upper_first_visible)
m = clamp((B - R_upper) / (0.20 × B), 0, 1)
q = min(1, p_lower_task_success / p_target)

TokFire Match score = round(100 × min(v, l, m, q))
```

This bottleneck score is intentionally conservative: abundant RAM cannot hide failed
tools, and fast generation cannot hide long waits. It is a **product utility score,
not a probability or industry benchmark**. Display the four factors, uncertainty
and evidence class beside it. A separate quality benchmark can inform model choice
only within its own task/version; don't average GSM8K, coding and tool scores.

Default interaction targets: `T_target=30 tok/s`, `L_target=3 s`, proposed reliability
`p_target=0.95`. Users may separately choose 100 or 200 tok/s as a speed target.
These are goals, not claims about any paid cloud subscription.

Task success means the workload's verified answer/output checks pass, not merely an
HTTP 200 response. Tool scenarios also require valid arguments and correct tool
results. For n jobs, record both per-job success and **all-jobs-in-round success**.
The latter matters for a shared service; job outcomes are correlated, so do not use
p^n as an independence shortcut.

For independent representative trials, a possible conservative success estimate is
the one-sided 95% Wilson lower bound (z=1.645):

```
p = successes / N
p_lower = [p + z²/(2N) - z × sqrt(p(1-p)/N + z²/(4N²))] / [1 + z²/N]
```

Repeated identical prompts on one session are not independent deployment trials.
Use session/workload-cluster resampling for correlated observations, and explicitly
label a small deterministic sweep descriptive only. Three successful runs are not
proof of 95% real-world reliability. New representative tasks and sustained-load
runs are required before dependable agent-server advice.

`Nrecommended` is the largest **supported tested/interpolated** n passing all gates,
with its evidence label. Never fill in untested counts as verified. Free/pro limits
(3/20) are entitlement caps; they do not change estimated hardware capability.

## 6. What users see

Keep the existing measured grade separate:

- **A — tested parallel tool workflow** at the actual passing job levels.
- **B — tested single tool workflow**; higher concurrency untested or failed.
- **C — tested chat/text workload**; does not mean the model is incapable of tools.
- **D — measured level needs tuning**; preserve failing higher levels.
- **U — insufficient measured evidence**.

Before a test, use distinct labels such as "Estimated chat fit", "Agent use needs a
local test", "Memory tight at this context" and "Parallel capacity unknown". Speed
references alone cannot produce "single-agent only" or "chat only" verdicts.

Show one configuration per recommendation card: model revision/quantization,
runtime, context, requested jobs, memory margin, speed/latency estimate ranges,
confidence reasons and a Run this test action. Do not expose source rows or disguise
an external estimate as a TokFire measurement. Prefer practical small/mid-size local
models after filtering; popularity is a discovery signal, not a performance factor.

### Synthetic arithmetic example (not benchmark data)

Suppose a 24 GiB machine has a 20 GiB safe inference budget. A hypothetical model
needs 4.8 GiB resident weights, 1 GiB shared overhead, 0.5 GiB KV and 0.2 GiB other
memory per job. Three jobs need `4.8 + 1 + 3 × (0.5 + 0.2) = 7.9 GiB`.

If adequately calibrated/verified lower speed, upper latency and lower task success
at 3 jobs were 38 tok/s, 2.4 s and 0.96, the four factors at 30 tok/s / 3 s / 0.95
are all 1 and the utility score is 100. At a 100 tok/s target it is 38. This does
not assert perfect quality or certainty. If task success is unknown, the score is
unavailable and agent suitability stays untested, regardless of memory/speed.

## 7. Optional price/value advice

If "price matching" is also wanted, keep cost separate from capability. Use user
inputs or dated verified regional prices; no fabricated hardware/cloud price list.
For a chosen accounting period:

```
Cost = amortized_hardware_cost + electricity + software + maintenance
Cost_per_successful_task = Cost / successfully_completed_tasks
```

Electricity = measured whole-system kWh × local tariff. Chip-only telemetry is not
wall power. Existing hardware may have zero *incremental purchase* cost but still
has electricity/opportunity cost; show that basis. Include idle power and utilization
for a home server. Subscription prices alone cannot imply speed or unlimited usable
jobs. Show value only after the same workload/quality/latency target is satisfied.

## 8. Internal architecture, public boundary and rollout

```
permitted source adapter -> private quarantine -> normalized observations
 -> provenance/deduplication/metric checks -> calibrated model artifact
 -> server-side recommendation -> allowlisted advice DTO -> app / portal
TokFire consented measurements ------------------------^ (preferred evidence)
```

Private source registry fields: source ID, original URL/record ID, license/permission
status, fetched/measured times, original hash, parser version, methodology version,
measurement-vs-estimate flag, session identity, quality flags, allowed uses and required
credits. Never store external snapshots in `public`, client modules or source ZIPs.

Public DTO: equation/calibration version, configuration, estimate ranges, evidence
class, confidence label/reasons, tested levels, recommended action, generated/expiry
time. No raw source rows, internal IDs, uploader identity, private source URLs or
unlicensed derived data. Explanations must remain truthful about using estimates.

Suggested refresh: conditional scheduled pulls where permitted, staging validation,
review changed schemas and publish only a versioned validated artifact. Never silently
update the predictor from a scraped table. An adapter failure preserves the last
approved version with its original age; it must not refresh the timestamp.

Offline behavior follows the existing product request: local measured reports still
work; new online recommendations show unavailable with a Hugging Face model-picker
link. Do not pretend an unavailable service has produced current recommendations.

Release gate: group train/calibration/test by original device/session and also test
future runtime versions and unseen hardware separately. Measure log-speed error,
interval coverage, first-visible error, OOM false-fit rate and tool false-ready rate.
Require enough independent cohorts; report unsupported coverage explicitly. Freeze
thresholds and validation sets before release, compare to a simple matched-median
baseline, and refuse confident extrapolation where validation fails.

Implementation sequence: (1) complete source-permission/schema registry, (2) admit
verified normalized observations, (3) run matched-cohort baseline offline, (4) collect
TokFire synchronized 1/2/3 and relevant Pro sweeps with task correctness, (5) calibrate
and validate intervals, (6) release the advice API and distinct prediction UI. The
present change completes the equation/design and public raw-data removal; it does
not claim these six production stages have already been implemented.
