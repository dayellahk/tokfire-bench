# Local AI Bench — macOS developer alpha 0.2.1

This is real benchmark source, not an installer. It has not yet been compiled or calibrated on an Apple Silicon Mac in this project. The development environment is Linux; no performance numbers have been invented.

## Requirements

- Apple Silicon Mac, macOS 13+.
- Xcode command-line tools with Swift 5.9+.
- Python 3.10+ and a current `llama-server` built with Metal support.
- One **single-file GGUF** for a trial, or one to three for the full suite. MLX weights and split GGUF sets are not supported. Only the dedicated MiniCPM trial launcher downloads a model, when you explicitly run it.
- Sufficient free memory and disk. Each model file must be less than 65% of physical memory; the check does not guarantee that KV caches and runtime allocations fit.

If Homebrew is already installed, `brew install llama.cpp python` provides the two external executables. Otherwise install/build them from their official projects. The app allows selecting their paths rather than assuming a package-manager location.

Official llama.cpp build instructions: https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md
Official llama-server reference: https://github.com/ggml-org/llama.cpp/tree/master/tools/server

## First trial: MiniCPM5-2B

This is the shortest path to an actual measurement on your Mac. It exercises the same Python runner used by the app, without requiring a Swift build. It does not validate the SwiftUI interface or establish a stable benchmark score.

1. Install Python and llama.cpp if needed: `brew install llama.cpp python` (requires Homebrew already installed).
2. Open Terminal in this extracted `native` folder and run:

```sh
python3 trial-minicpm.py
```

The launcher checks for Apple Silicon and the runtime **before downloading**. It downloads the official [MiniCPM5-2B Q4_K_M GGUF](https://huggingface.co/openbmb/MiniCPM5-2B-GGUF/blob/main/MiniCPM5-2B-Q4_K_M.gguf), approximately 1.56 GB, and verifies SHA-256 `ec2d5801640099e97d8d7e8003ad4d81f336e757811f03a26173dddf386602fd`. The download is pinned to revision `2079a22f3beaa4e306449978533478fe0522f4b3`. A failed download is removed; rerunning retries. Verified models are reused.

It performs one discarded warm-up and one measured run, each with 512 input tokens and 32 output tokens. It prints measured decode speed, TTFT and prefill speed, then saves a local JSON report. Ctrl+C stops the runner and closes its model server. No report is uploaded. Download requests go to Hugging Face and its download infrastructure.

Files live under `~/Library/Application Support/LocalAIBench/Models/` and `Reports/`. To use an existing official file or a different runtime path:

```sh
python3 trial-minicpm.py --server /path/to/llama-server --model /path/to/MiniCPM5-2B-Q4_K_M.gguf
```

Trial reports carry `local-ai-trial-v1` and are rejected by the comparison database. They are for checking that the runtime works; one short run cannot establish sustained performance. For the GUI trial, build the app below, enable **Quick trial** and select the downloaded GGUF. Leave Quick trial off to run the standard suite with one to three selected models, tested sequentially.

If the model fails to load, the app/terminal shows the tail of llama-server's local startup log. Check for an incompatible runtime version or unsupported flag; update llama.cpp and retry. Diagnostic logs are not included in exported reports. Review local errors for file paths before sharing them.

## Build and run

Open `Package.swift` in Xcode and run the LocalAIBench executable, or:

```sh
cd native
swift run LocalAIBench
```

To assemble an unsigned `.app` locally:

```sh
bash build-app.sh
open build/LocalAIBench.app
```

The app is a developer build. It is not signed with a Developer ID or notarized; do not distribute it as a consumer-ready installer. No instruction requires disabling macOS security.

## Use

1. Select Python and llama-server executables if their paths differ from `/opt/homebrew/bin/`.
2. Choose one to three distinct GGUF files. Three selections create three sequential model rounds; only one model runs at a time. Their content hashes must differ.
3. Close memory-intensive applications, keep the power configuration consistent, and click Run benchmark.
4. For each model, the runner hashes its bytes, starts a dedicated loopback-only llama-server, warms up each workload, runs three repetitions, and closes the model process before loading the next model.
5. Inspect measurements and export the JSON report. Reports also remain in `~/Library/Application Support/LocalAIBench/Reports/`.
6. Open the project website, choose the JSON report, and review it locally. Explicitly choose collection and optionally publication. No report is automatically uploaded by the Mac app.
7. Use My data on the website to hide or delete a stored report. The website is currently owner-private; publication consent does not grant additional visitors access.

The browser-based authenticated upload is intentional for this alpha. Native OAuth/direct submission is not implemented, and no private-site access token is embedded in the app.

## CLI usage

```sh
python3 Sources/LocalAIBench/Resources/runner.py \
  --server /opt/homebrew/bin/llama-server \
  --output report.json \
  --models /path/to/first.gguf /path/to/second.gguf /path/to/third.gguf
```

The full suite also accepts a single path after `--models`. Each selected model has its own warm-up and measurements, and its server closes before the next model starts. `--trial` restricts selection to one model and uses the shorter workload described above.

`--hardware` prints allowlisted hardware fields. The runner uses Python's standard library only. It bypasses HTTP proxies for loopback calls. It has no remote-upload or model-download code. stdout is JSON-lines progress followed by a complete report. Stop with Ctrl+C; model processes are terminated and waited for. Partial suites do not produce an uploadable report.

## Metrics and comparability

- Specification `local-ai-text-v1`: 512 and 2,048 input tokens; 128 output tokens. Same fixed synthetic source text, tokenized per model and sliced to exact lengths.
- One discarded warm-up and three measured runs per workload. Temperature 0, seed 42, EOS ignored, prompt cache off.
- Context 4,096, one slot, CPU threads equal to logical cores, GPU-layer request 999, f16 KV cache, flash attention off, batch and microbatch 512.
- TTFT is client wall time to the first streamed token ID, including loopback HTTP overhead. Prefill/decode rates use final llama.cpp timings.
- A report is rejected if the engine caches prompt tokens, produces the wrong token counts, truncates context, or omits timings.
- Load time includes launching the server and loading until `/health` is ready. It does not flush OS caches and is not a guaranteed cold disk load.
- Peak process RSS is sampled every 250 ms over a model session. **It is not peak unified/Metal memory.** Power, temperature, swap and sustained performance are not measured in this release.
- Models and runtime binaries use SHA-256 identity. These exact hashes and settings define comparison groups. File paths, filenames, serial numbers, Apple ID, prompts and generated text are absent from the exported report.
- Scores are not independently attested. No global score or reference-based hardware predictions are available yet. The fastest selected model is not necessarily the highest-quality model.

## Tests

```sh
python3 -m unittest discover -s Tests -v
```

Tests use synthetic SSE fixtures, a real loopback HTTP fixture process, and a mocked download to verify timing extraction, cache/truncation/short-output rejection, output privacy, startup diagnostics, cancellation, child cleanup, trial workload selection and checksum handling. They perform no LLM inference and do not establish Metal compatibility. Backend contract/SQL tests verify that trials cannot enter comparisons.

## Required before consumer release

Compile and run on real Apple Silicon; record the exact llama.cpp build; verify actual Metal offload and process cancellation; test low-memory and incompatible models; compare timings against runtime logs; calibrate across a small Mac fleet. Add catalog manifests with model licensing and checksums, managed downloads, runtime packaging, sustained/thermal measurements, direct authenticated uploads, signing/notarization and deployment access controls for customer use.
