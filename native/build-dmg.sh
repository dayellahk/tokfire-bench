#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
bash build-app.sh
bench_stage="$(mktemp -d /private/tmp/localai-dmg.XXXXXX)"
trap 'rm -rf "$bench_stage"' EXIT
ditto --noextattr --norsrc build/LocalAIBench.app "$bench_stage/LocalAIBench.app"
codesign --verify --strict "$bench_stage/LocalAIBench.app"
ln -s /Applications "$bench_stage/Applications"
cat > "$bench_stage/READ ME.txt" <<'README'
Local AI Bench 0.4.0 — Apple Silicon local developer build

Drag LocalAIBench.app to Applications, then open it.
This app is ad-hoc signed, not Developer ID signed or notarized.

External requirements: Python 3.10+ and a Metal-enabled llama-server.
On a Mac with Homebrew: brew install python llama.cpp
Choose their executable paths in the app if needed.
Model weights and inference/Python runtimes are not bundled.

Use Explore to find live Hugging Face GGUF models, inspect size and license,
then download and verify before testing. Offline mode supports local files.
Choose 1–3 different single-file GGUF models. They run sequentially.
Quick trial accepts one model. A local report and commentary are saved in:
~/Library/Application Support/LocalAIBench/Reports/

Automatic upload is ON by default and visible before Run. Sign in once
with the website account. Public comparison sharing is OFF by default.
Failed or offline uploads remain queued; local reports are preserved.
Quick trials and oMLX serving reports are stored separately from standard
llama.cpp comparisons. Process RSS is not total GPU/unified memory.

oMLX + MLX: install oMLX, choose its executable and an existing MLX model
folder. The app starts an isolated server and measures 1, 2 and 3 users.
Your existing oMLX service/configuration is not modified.

Settings includes 20 interface languages. Technical runtime logs and the
website authentication pages retain their own language.
README
bench_dmg="$PWD/build/LocalAIBench-0.4.0-macos-arm64.dmg"
hdiutil create -volname "Local AI Bench" -srcfolder "$bench_stage" -ov -format UDZO "$bench_dmg"
hdiutil verify "$bench_dmg"
shasum -a 256 "$bench_dmg" > "$bench_dmg.sha256"
printf 'Developer DMG: %s\n' "$bench_dmg"
