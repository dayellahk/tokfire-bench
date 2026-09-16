# Hardware × model fit — TokFire fit v1

The comparison portal accepts the native app's `tokfire-workloads-v1` / 0.7.0
reports without changing the report format or desktop binaries. The public feed
returns an allowlisted summary plus a deterministic grade. Users can also inspect
a report in their browser without uploading or publishing it.

## Grades

| Grade | Evidence in this report |
|---|---|
| A | The fixed agent-tool task met the interaction guideline at a tested concurrency of 2 or more jobs. |
| B | The fixed agent-tool task met the guideline at one job. Higher counts may be untested or may have failed; the level table distinguishes them. |
| C | The selected chat, business or long-summary workload met the guideline. Agent capability is untested by this report. |
| D | At this tested level, a task failed/was partial, a tool error occurred, a measured request decoded below 30 tok/s, or visible output took more than 3 seconds. |
| U | Required timing is missing, the workload fingerprint is unknown, the hardware belongs to a remote request client, or only external reference data is available. |

The overall badge uses the highest passing level actually measured in that report.
A failed higher level remains visible. It never fills in untested lower levels,
combines different reports or infers that a model is restricted to chat.
If no level passes, observed failures receive D; otherwise the result is U.
Remote-client hardware and unknown-profile reports remain U regardless of speed.

## Interaction guideline and scope

The threshold matches app 0.7's Python assessor: **every job completes**, **every
request has runtime decode ≥30 tok/s**, and **every request has first visible output
≤3,000 ms**. Agent grades also require zero tool errors. The fixed workflow is
lookup → sum → answer, not a test of arbitrary autonomous agents, Hermes, OpenClaw,
network tools or a sustained multi-agent server.

Per-level evidence includes completion/failure counts, minimum measured decode,
maximum first-visible latency, metric coverage, P95 task time, aggregate throughput
and the separate 100 tok/s lower target. Missing metrics are not replaced by client
stream estimates or average/aggregate rates. Three to five repeats are descriptive,
not statistically dependable SLA tails. Output quality is not graded by chat
completion. These thresholds are a product heuristic, not an industry standard.

Hardware/model identity, runtime, workload/context and tested concurrency must be
read together. Model/runtime hashes can define exact comparison cohorts; unverified
external runtime IDs cannot be merged across reports. Self-reported hardware and
measurements are not independently attested. No RAM/VRAM fit prediction is made.

## Public data boundary

The public portal presents only consented TokFire measurements and local report
previews. External reference tables, source links and raw-data downloads are
retired. `/api/v1/references` and all reference pages return 404. The internal
snapshot remains private and is excluded from public source archives. External
estimates must never become measured A/B/C grades; see the recommendation design.

## Validation

The suite covers grade boundaries, failed and partial tasks, missing data, slow
outliers hidden by averages, remote attribution, unknown prompt hashes, target
separation, untested concurrency, actual 0.7 report compatibility and parity with
the shipped Python profile fingerprints and interaction assessor. UI validation
uses local report preview; no fixture is published to the community database.

Validation on 16 September 2026: all 36 backend tests, TypeScript and targeted lint
pass locally and in [portal CI](https://github.com/dayellahk/tokfire-bench/actions/runs/35054331795).
Ego Browser checks cover a real Mac report (C / one tested job), local synthetic
parallel-tool and single-passing-level cases (A / 3 and B / 1, with failed levels
visible), invalid JSON rejection, no network requests during local preview,
both Chinese locales and a 390 px mobile layout
without page-level horizontal overflow. Synthetic QA reports are not published.
