# Local AI Bench — macOS developer alpha 0.2

This is real benchmark source, not an installer. It has not yet been compiled or calibrated on an Apple Silicon Mac in this project. The development environment is Linux; no performance numbers have been invented.

## Requirements

- Apple Silicon Mac, macOS 13+.
- Xcode command-line tools with Swift 5.9+.
- Python 3.10+ and a current `llama-server` built with Metal support.
- Three to five **single-file GGUF** models you have permission to use. MLX weights and split GGUF sets are not supported in this version. Models are not downloaded automatically.
- Sufficient free memory and disk. Each model file must be less than 65% of physical memory; the check does not guarantee that KV caches and runtime allocations fit.

If Homebrew is already installed, `brew install llama.cpp python` provides the two external executables. Otherwise install/build them from their official projects. The app allows selecting their paths rather than assuming a package-manager location.

Official llama.cpp build instructions: https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md
Official llama-server reference: https://github.com/ggml-org/llama.cpp/tree/master/tools/server

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
2. Choose three to five distinct GGUF files. Their content hashes must differ.
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

Protocol tests use a synthetic SSE fixture to check timing extraction, cache/truncation/short-output rejection and output privacy. They do not establish Metal compatibility. The repository also includes backend contract/SQL tests.

## Required before consumer release

Compile and run on real Apple Silicon; record the exact llama.cpp build; verify actual Metal offload and process cancellation; test low-memory and incompatible models; compare timings against runtime logs; calibrate across a small Mac fleet. Add catalog manifests with model licensing and checksums, managed downloads, runtime packaging, sustained/thermal measurements, direct authenticated uploads, signing/notarization and deployment access controls for customer use.
