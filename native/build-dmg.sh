#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
# Release mode never silently falls back to an unnotarized preview.
if [[ "${TOKFIRE_RELEASE:-0}" == 1 ]]; then
  : "${TOKFIRE_NOTARY_PROFILE:?Set a notarytool Keychain profile for release builds}"
  : "${TOKFIRE_SIGN_IDENTITY:?Set a Developer ID Application signing identity}"
fi
bench_stage="$(mktemp -d /private/tmp/localai-dmg.XXXXXX)"
bench_mount=""
cleanup() {
  if [[ -n "$bench_mount" ]]; then hdiutil detach "$bench_mount" >/dev/null 2>&1 || true; fi
  rm -rf "$bench_stage"
}
trap cleanup EXIT
mkdir -p "$bench_stage/content"
bench_content="$bench_stage/content"
TOKFIRE_APP_OUTPUT="$bench_content/TokFire Bench.app" bash build-app.sh
codesign --verify --strict "$bench_content/TokFire Bench.app"
ln -s /Applications "$bench_content/Applications"
cat > "$bench_content/Setup notes.txt" <<'README'
TokFire Bench 0.8.0 — by TokFire Labs · tokfires.com
Apple Silicon installation guide

Drag TokFire Bench.app to Applications, then open it.
The first line of this guide states the signing status of this build.

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
Version 0.8 adds CSV analysis, multi-page research and retry/idempotency simulations.
Task artifacts are checked; these are not actual third-party agent executions.
Choose 3–5 repeats and an optional concurrency sweep.
Quick trial accepts one model. A local report and commentary are saved in:
~/Library/Application Support/LocalAIBench/Reports/

Automatic upload is ON by default and visible before Run. Guest uploads
need no sign-in. Online workload tests obtain a one-time server challenge.
Challenge checks do not independently verify hardware. Public comparison sharing is OFF by default.
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
if [[ "${TOKFIRE_RELEASE:-0}" == 1 ]]; then
  ditto -c -k --keepParent "$bench_content/TokFire Bench.app" "$bench_stage/notarize.zip"
  xcrun notarytool submit "$bench_stage/notarize.zip" --keychain-profile "$TOKFIRE_NOTARY_PROFILE" --wait
  xcrun stapler staple "$bench_content/TokFire Bench.app"
  xcrun stapler validate "$bench_content/TokFire Bench.app"
  spctl --assess --type execute --verbose=2 "$bench_content/TokFire Bench.app"
  echo 'Developer ID signed and Apple notarized release.' > "$bench_content/SIGNING-STATUS.txt"
else
  echo 'Developer preview: ad-hoc signed, NOT Apple notarized. Gatekeeper may block opening.' > "$bench_content/SIGNING-STATUS.txt"
fi
cat "$bench_content/SIGNING-STATUS.txt" "$bench_content/Setup notes.txt" > "$bench_stage/notes.txt"
mv "$bench_stage/notes.txt" "$bench_content/Setup notes.txt"
rm "$bench_content/SIGNING-STATUS.txt"
mkdir -p "$bench_content/.background" build
swift Packaging/make-dmg-background.swift "$bench_content/.background/install.png"
# A writable image lets Finder persist icon positions and the background in .DS_Store.
hdiutil create -size 32m -fs HFS+ -volname "TokFire Bench" -srcfolder "$bench_content" -format UDRW "$bench_stage/layout.dmg"
bench_mount="$bench_stage/mounted"
mkdir "$bench_mount"
hdiutil attach "$bench_stage/layout.dmg" -mountpoint "$bench_mount" -nobrowse -noautoopen
osascript - "$bench_mount" <<'APPLESCRIPT'
on run argv
  set diskFolder to POSIX file (item 1 of argv) as alias
  set backgroundFile to POSIX file ((item 1 of argv) & "/.background/install.png") as alias
  tell application "Finder"
    open diskFolder
    set installerWindow to front Finder window
    set current view of installerWindow to icon view
    set toolbar visible of installerWindow to false
    set statusbar visible of installerWindow to false
    set bounds of installerWindow to {120, 120, 840, 632}
    set opts to icon view options of installerWindow
    set arrangement of opts to not arranged
    set icon size of opts to 88
    set text size of opts to 13
    set background picture of opts to backgroundFile
    set position of item "TokFire Bench.app" of diskFolder to {190, 252}
    set position of item "Applications" of diskFolder to {530, 252}
    set position of item "Setup notes.txt" of diskFolder to {620, 360}
    update diskFolder without registering applications
    delay 2
    close installerWindow
  end tell
end run
APPLESCRIPT
sync
hdiutil detach "$bench_mount"
bench_mount=""
bench_dmg="$PWD/build/TokFireBench-0.8.0-macos-arm64.dmg"
hdiutil convert "$bench_stage/layout.dmg" -format UDZO -o "$bench_dmg" -ov
if [[ "${TOKFIRE_RELEASE:-0}" == 1 ]]; then
  codesign --force --timestamp --sign "$TOKFIRE_SIGN_IDENTITY" "$bench_dmg"
  xcrun notarytool submit "$bench_dmg" --keychain-profile "$TOKFIRE_NOTARY_PROFILE" --wait
  xcrun stapler staple "$bench_dmg"
  xcrun stapler validate "$bench_dmg"
  spctl --assess --type open --context context:primary-signature --verbose=2 "$bench_dmg"
fi
hdiutil verify "$bench_dmg"
(cd build && shasum -a 256 "$(basename "$bench_dmg")" > "$(basename "$bench_dmg").sha256")
printf 'DMG: %s\n' "$bench_dmg"
