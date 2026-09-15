#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
swift build --configuration release
bench_bin="$(swift build --configuration release --show-bin-path)"
bench_app="$PWD/build/LocalAIBench.app"
mkdir -p "$bench_app/Contents/MacOS" "$bench_app/Contents/Resources"
cp "$bench_bin/LocalAIBench" "$bench_app/Contents/MacOS/LocalAIBench"
cp Sources/LocalAIBench/Resources/runner.py "$bench_app/Contents/Resources/runner.py"
cat > "$bench_app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>LocalAIBench</string>
<key>CFBundleIdentifier</key><string>dev.localaibench.alpha</string>
<key>CFBundleName</key><string>Local AI Bench</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.2.0</string>
<key>CFBundleVersion</key><string>2</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
printf 'Unsigned developer app: %s\n' "$bench_app"
