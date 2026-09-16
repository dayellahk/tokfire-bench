#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
sdk="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}"
java_home="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
bt="$sdk/build-tools/35.0.0"
jar="$sdk/platforms/android-35/android.jar"
mkdir -p build/classes build/dex assets
python3 - <<'PY'
import sys,json,shutil
sys.path.insert(0,'../native/Sources/LocalAIBench/Resources')
from workload_core import PROFILES,fingerprint
open('assets/workloads.json','w').write(json.dumps({k:{**v,'sha256':fingerprint(k)} for k,v in PROFILES.items()},ensure_ascii=False))
shutil.copyfile('../native/Sources/LocalAIBench/Resources/languages.json','assets/languages.json')
PY
"$bt/aapt2" compile --dir res -o build/resources.zip
"$bt/aapt2" link build/resources.zip -o build/base.apk -I "$jar" --manifest AndroidManifest.xml -A assets --min-sdk-version 26 --target-sdk-version 35
"$java_home/bin/javac" -encoding UTF-8 -source 8 -target 8 -classpath "$jar" -d build/classes src/com/tokfire/bench/*.java
"$java_home/bin/jar" cf build/classes.jar -C build/classes .
JAVA_HOME="$java_home" "$bt/d8" --min-api 26 --lib "$jar" --output build/dex build/classes.jar
cp build/base.apk build/unsigned.apk
(cd build/dex && zip -q ../unsigned.apk classes.dex)
"$bt/zipalign" -f 4 build/unsigned.apk build/aligned.apk
# Dedicated development signing key, outside the repository. Never a production release identity.
key_dir="$HOME/.android/tokfire-dev"
mkdir -p "$key_dir"
if [ ! -f "$key_dir/debug.keystore" ]; then
 "$java_home/bin/keytool" -genkeypair -keystore "$key_dir/debug.keystore" -storepass android -keypass android -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 3650 -dname 'CN=TokFire Development,O=TokFire Labs,C=HK'
 chmod 600 "$key_dir/debug.keystore"
fi
JAVA_HOME="$java_home" "$bt/apksigner" sign --ks "$key_dir/debug.keystore" --ks-pass pass:android --out build/TokFireBench-0.7.0-android-preview.apk build/aligned.apk
JAVA_HOME="$java_home" "$bt/apksigner" verify --verbose build/TokFireBench-0.7.0-android-preview.apk
(cd build && shasum -a 256 TokFireBench-0.7.0-android-preview.apk > TokFireBench-0.7.0-android-preview.apk.sha256)
