#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
bench_identity="${TOKFIRE_SIGN_IDENTITY:--}"
if [[ "${TOKFIRE_RELEASE:-0}" == 1 && "$bench_identity" != "Developer ID Application:"* ]]; then
  echo "Release requires TOKFIRE_SIGN_IDENTITY=Developer ID Application: ..." >&2
  exit 1
fi
swift build --scratch-path .build-release --configuration release
bench_bin="$(swift build --scratch-path .build-release --configuration release --show-bin-path)"
bench_stage="$(mktemp -d /private/tmp/localai-app.XXXXXX)"
trap 'rm -rf "$bench_stage"' EXIT
bench_app="$bench_stage/TokFire Bench.app"
mkdir -p "$bench_app/Contents/MacOS" "$bench_app/Contents/Resources"
cp "$bench_bin/LocalAIBench" "$bench_app/Contents/MacOS/LocalAIBench"
cp Sources/LocalAIBench/Resources/*.py Sources/LocalAIBench/Resources/languages.json Sources/LocalAIBench/Resources/advanced_parameters.json Sources/LocalAIBench/Resources/lemon-squeezy.json "$bench_app/Contents/Resources/"
cp Packaging/AppIcon.icns "$bench_app/Contents/Resources/AppIcon.icns"
cat > "$bench_app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>LocalAIBench</string>
<key>CFBundleIdentifier</key><string>dev.localaibench.alpha</string>
<key>CFBundleName</key><string>TokFire Bench</string>
<key>CFBundleDisplayName</key><string>TokFire Bench</string>
<key>NSHumanReadableCopyright</key><string>TokFire Labs</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.9.0</string>
<key>CFBundleVersion</key><string>14</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
# Finder/iCloud metadata on a rebuilt bundle is rejected by codesign.
# Remove only packaging metadata, preserving security/quarantine attributes.
xattr -dr com.apple.FinderInfo "$bench_app" 2>/dev/null || true
xattr -dr com.apple.ResourceFork "$bench_app" 2>/dev/null || true
if [[ "$bench_identity" == "-" ]]; then
  codesign --force --sign - "$bench_app"
else
  codesign --force --options runtime --timestamp --sign "$bench_identity" "$bench_app"
fi
codesign --verify --strict "$bench_app"
bench_output="${TOKFIRE_APP_OUTPUT:-$PWD/build/TokFire Bench.app}"
mkdir -p "$(dirname "$bench_output")"
# Replace the generated bundle so stale resources cannot invalidate its signature.
rm -rf "$bench_output"
ditto --noextattr --norsrc "$bench_app" "$bench_output"
xattr -dr com.apple.FinderInfo "$bench_output" 2>/dev/null || true
xattr -dr com.apple.ResourceFork "$bench_output" 2>/dev/null || true
codesign --verify --strict "$bench_output"
printf 'Built app (notarization is performed by build-dmg.sh in release mode): %s\n' "$bench_output"
