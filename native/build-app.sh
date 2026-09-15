#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
swift build --scratch-path .build-release --configuration release
bench_bin="$(swift build --scratch-path .build-release --configuration release --show-bin-path)"
bench_stage="$(mktemp -d /private/tmp/localai-app.XXXXXX)"
trap 'rm -rf "$bench_stage"' EXIT
bench_app="$bench_stage/LocalAIBench.app"
mkdir -p "$bench_app/Contents/MacOS" "$bench_app/Contents/Resources"
cp "$bench_bin/LocalAIBench" "$bench_app/Contents/MacOS/LocalAIBench"
cp Sources/LocalAIBench/Resources/*.py Sources/LocalAIBench/Resources/languages.json "$bench_app/Contents/Resources/"
cp Packaging/AppIcon.icns "$bench_app/Contents/Resources/AppIcon.icns"
cat > "$bench_app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>LocalAIBench</string>
<key>CFBundleIdentifier</key><string>dev.localaibench.alpha</string>
<key>CFBundleName</key><string>Local AI Bench</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.4.0</string>
<key>CFBundleVersion</key><string>5</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
# Finder/iCloud metadata on a rebuilt bundle is rejected by codesign.
# Remove only packaging metadata, preserving security/quarantine attributes.
xattr -dr com.apple.FinderInfo "$bench_app" 2>/dev/null || true
xattr -dr com.apple.ResourceFork "$bench_app" 2>/dev/null || true
codesign --force --sign - "$bench_app"
codesign --verify --strict "$bench_app"
mkdir -p build
ditto --noextattr --norsrc "$bench_app" "$PWD/build/LocalAIBench.app"
printf 'Ad-hoc signed local developer app (not notarized): %s\n' "$PWD/build/LocalAIBench.app"
