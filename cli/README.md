## 0.9 Pro advanced experiments

Grouped parameter controls (or CLI `--advanced-config`) now support Pro-only
local experiments. Standard benchmarks remain unchanged. See
[advanced test documentation](../docs/PRO-ADVANCED-TESTS.md) for supported engines,
report isolation and current paid-activation limits.

# TokFire Bench 0.8 command-line runner

Python 3.10+. Works on Apple Silicon macOS, Windows, Linux and Android/Termux.
The native Android APK is in `android/`; Termux is an additional option.

Use the packaged `workload_runner.py`, or the source at
`native/Sources/LocalAIBench/Resources/workload_runner.py`.
Install your inference runtime and model separately. No Python package dependencies.

```sh
# Managed GGUF: starts one loopback server, tests it, and closes only that process.
python3 workload_runner.py --engine llama.cpp --server /path/to/llama-server \
  --model /path/to/model.gguf --workload short-chat --jobs 3 --sweep --output report.json

# Linux vLLM (start your model server first; keep it on loopback).
python3 workload_runner.py --engine vLLM --endpoint http://127.0.0.1:8000 \
  --model your-served-model-id --workload business --jobs 3 --sweep --output report.json

# Ollama: works with a running local server and a pulled model.
python3 workload_runner.py --engine Ollama --endpoint http://127.0.0.1:11434 \
  --model your-model-id --workload agent-tools --jobs 1 --output report.json
```

Workloads: `short-chat`, `business`, `long-summary`, `agent-tools`, `agent-data`, `agent-research`, `agent-recovery`.

New agent simulations verify CSV reports, multi-page evidence and retry/idempotency. They use bounded JSON tool actions and private synthetic files, not actual Hermes/OpenClaw/Pi/Claude Code/Codex. Each task has at most 12 model responses and a whole-task `--timeout` (default 180 seconds). Compare task success and time before decode speed; full native agent behavior remains unmeasured. Android APK 0.7 keeps its original four profiles; Python/Termux supports these new profiles. See `docs/AGENT-SIMULATIONS.md`.
Measured repetitions: `--repeats 3`, `4` or `5`; one excluded warm-up.
Long-summary configures 32,768 context tokens; fit is an estimate, not a guarantee.
`--gpu-layers 0` requests a CPU-only managed llama.cpp server; default is 999.
This records requested offload, not verified CUDA/Metal/ROCm/Vulkan use.

Free: 1–3 jobs. Pro: up to 20, verified with the existing Lemon Squeezy instance
credential over stdin (never argv or report). Store activation remains unconfigured
in preview builds. No unrestricted 32-job mode or Pro bypass is introduced.
Sweep levels are 1, 2, 3, 4, 8, 12, 16, 20 up to the licensed selected maximum,
including the selected maximum when it is between these levels.

External CLI endpoints are loopback-only so detected hardware describes the
inference host. Run the CLI on the Linux server itself. The Android APK additionally
supports explicit remote LAN mode and labels its hardware as the request client.
External runtimes must emit final usage token counts. Missing decode/prefill timing
is recorded as null. vLLM commonly does not provide these per-request rates.
Cache counts are recorded when reported; an unknown count is not assumed zero.

Reports: JSON plus Markdown commentary beside it. CLI reports stay local; upload
through the TokFire portal if desired. Ctrl-C closes owned processes and connections.
Incomplete cancelled runs are not saved as completed reports. Failed measured jobs
in a finished run remain in the report and success denominator.
