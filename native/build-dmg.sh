#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
bench_stage="$(mktemp -d /private/tmp/localai-dmg.XXXXXX)"
trap 'rm -rf "$bench_stage"' EXIT
TOKFIRE_APP_OUTPUT="$bench_stage/TokFire Bench.app" bash build-app.sh
codesign --verify --strict "$bench_stage/TokFire Bench.app"
ln -s /Applications "$bench_stage/Applications"
cat > "$bench_stage/READ ME.txt" <<'README'
TokFire Bench 0.7.0 — by TokFire Labs · tokfires.com
Apple Silicon local developer build

Drag TokFire Bench.app to Applications, then open it.
This app is ad-hoc signed, not Developer ID signed or notarized.

External requirements: Python 3.10+ and llama.cpp or oMLX,
or an existing local Ollama / vLLM HTTP server.
On a Mac with Homebrew: brew install python llama.cpp
Choose their executable paths in the app if needed.
Model weights and inference/Python runtimes are not bundled.

Use Explore to find live Hugging Face GGUF models, inspect size and license,
then download and verify before testing. Offline mode supports local files.
Select one model and 1–3 concurrent jobs before Run (GGUF or MLX).
Disable Concurrent job test for the older sequential GGUF comparison profile.
Workloads include chat, business, long summary and bounded tool tasks.
Choose 3–5 repeats and an optional concurrency sweep.
Quick trial accepts one model. A local report and commentary are saved in:
~/Library/Application Support/LocalAIBench/Reports/

Automatic upload is ON by default and visible before Run. Sign in once
with the website account. Public comparison sharing is OFF by default.
Failed or offline uploads remain queued; local reports are preserved.
Quick trials and oMLX serving reports are stored separately from standard
llama.cpp comparisons. Process RSS is not total GPU/unified memory.

oMLX + MLX: install oMLX, choose its executable and an existing MLX model
folder. Choose 1, 2 or 3 concurrent jobs calling the SAME model.
Lemon Squeezy Pro: HK$180 one-time, up to 20 jobs, one activated Mac.
Deactivate before moving your license to another Mac.
Pro activation and each Pro test require internet verification.
Availability and pricing appear in Settings when configured.
Your existing oMLX service/configuration is not modified.

Settings includes 20 interface languages. Technical runtime logs and the
website authentication pages retain their own language. New 0.7 workload
controls have English and both Chinese translations; other languages use
English fallback.
README
mkdir -p build
bench_dmg="$PWD/build/TokFireBench-0.7.0-macos-arm64.dmg"
hdiutil create -volname "TokFire Bench" -srcfolder "$bench_stage" -ov -format UDZO "$bench_dmg"
hdiutil verify "$bench_dmg"
shasum -a 256 "$bench_dmg" > "$bench_dmg.sha256"
printf 'Developer DMG: %s\n' "$bench_dmg"
