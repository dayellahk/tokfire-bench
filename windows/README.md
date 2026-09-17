## 0.9 Pro advanced experiments

Grouped parameter controls (or CLI `--advanced-config`) now support Pro-only
local experiments. Standard benchmarks remain unchanged. See
[advanced test documentation](../docs/PRO-ADVANCED-TESTS.md) for supported engines,
report isolation and current paid-activation limits.

## Version 0.8

The workload menu now includes `agent-data`, `agent-research` and `agent-recovery`. These bounded agent simulations validate report artifacts and service state; they do not run actual third-party agent products. Full check-by-check commentary is saved beside the JSON report.

# TokFire Bench 0.6.0 — Windows x64 Preview

TokFire Labs · https://tokfires.com

## Status
Cross-compiled on macOS. The executable and runner have **not yet been tested on a Windows PC**, including CUDA/Vulkan performance, WebView2 login and process cancellation. Unsigned preview, not a production release. No claim of Windows GPU compatibility has been verified yet.

## Start
1. Windows 10/11, Intel or AMD 64-bit. Extract the **entire ZIP** to a folder you can write to. Keep all DLLs and the runner folder together.
2. Install Python 3.10+ from https://www.python.org/downloads/windows/ (enable PATH, or select python.exe in Settings).
3. Download a Windows llama.cpp build from https://github.com/ggml-org/llama.cpp/releases and extract its complete folder. Use CPU, NVIDIA CUDA or AMD/Intel Vulkan according to your hardware and installed drivers. Keep its runtime DLLs with llama-server.exe.
4. Download a single-file GGUF model separately. Check its license. Start with a small model.
5. Open **TokFire Bench.exe**, choose Python and llama-server.exe in Settings, then Inspect device. Choose the GGUF in Benchmark and select 1, 2 or 3 jobs. All jobs call the same model concurrently.
6. Run shows stages, completed request count and timings. History contains JSON and per-job commentary. The 100–200 tok/s target is a comparison target, not a guaranteed ChatGPT subscription speed.

The .NET runtime is bundled; no .NET installation is required. Account sign-in additionally needs Microsoft's Edge WebView2 Evergreen Runtime: https://developer.microsoft.com/en-us/microsoft-edge/webview2/ . Local tests do not require an account.

## Uploads and privacy
Automatic upload is visible and enabled before Run. Public publication is a separate unchecked option. Connect your account once; login completion retries queued uploads. Failures retain local reports. Disable automatic upload to pause retries.

Reports include CPU, computer model, GPU names, RAM, OS, model/runtime fingerprints and timings. They exclude prompts, generated text, usernames, hostnames, serial numbers and local paths. Settings retain runtime/model paths locally. Reports and pending uploads are in `%LOCALAPPDATA%\TokFireBench\Reports` and `Outbox`. Delete queued JSON files to discard unsent reports.

## Pro and languages
Free: 1–3 jobs. Pro: 4–20 jobs on the same model, planned HK$180 once, one activated device. Live sales/activation remain unavailable until the Lemon Squeezy store/product configuration is enabled. Pro keys use Windows DPAPI encryption for the current user and require online validation before Pro runs.

Settings offers 20 languages for the shared core controls. Windows-specific setup, status text and report commentary currently remain English. oMLX/MLX is only offered by the Mac app.

## Build
Install .NET SDK 10, then from the source root:

    dotnet publish windows/TokFire.Bench.csproj -c Release -r win-x64 --self-contained true -o windows/publish/win-x64

No administrator privileges are required by the application. Models and inference runtimes are not bundled.


Guest upload update: account sign-in is no longer required. The app automatically
prepares a WebView2 guest session before upload. WebView2 is still required for
this connection and the report manager. Keep its application data to retain access.
