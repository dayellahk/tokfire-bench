#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
sdk="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}"
jh="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
bt="$sdk/build-tools/35.0.0"; jar="$sdk/platforms/android-35/android.jar"
mkdir -p build/tests/classes build/tests/dex
"$bt/aapt2" link -o build/tests/base.apk -I "$jar" --manifest tests/AndroidManifest.xml
"$jh/bin/javac" -source 8 -target 8 -classpath "$jar:build/classes.jar" -d build/tests/classes tests/Instrumentation.java
"$jh/bin/jar" cf build/tests/classes.jar -C build/tests/classes .
JAVA_HOME="$jh" "$bt/d8" --min-api 26 --lib "$jar" --classpath build/classes.jar --output build/tests/dex build/tests/classes.jar
cp build/tests/base.apk build/tests/unsigned.apk
(cd build/tests/dex && zip -q ../unsigned.apk classes.dex)
"$bt/zipalign" -f 4 build/tests/unsigned.apk build/tests/aligned.apk
JAVA_HOME="$jh" "$bt/apksigner" sign --ks "$HOME/.android/tokfire-dev/debug.keystore" --ks-pass pass:android --out build/tests/qa.apk build/tests/aligned.apk
