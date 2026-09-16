# TokFire Bench Android 0.7 preview

A **native Java Android app**, Android 8.0/API 26 or later. No WebView is used for
benchmark execution. The optional account sign-in uses a restricted TokFire WebView.

## What it runs

- An HTTP model runtime already running **on the phone** (loopback), or an explicitly
  selected **private LAN server** (Mac/Linux/Windows). No weights or native inference
  engine are bundled. Installing this APK alone does not load GGUF/MLX models.
- llama.cpp, Ollama, vLLM and remote oMLX streaming protocols.
- The same fixed prompts/fingerprints, three chat workloads and local bounded
  lookup/sum agent fixture as the desktop/CLI runner.
- 1–3 same-model concurrent jobs, optional 1→2→3 sweep, 3–5 repeats.
- Live progress, cancellation, JSON export via Android's document picker, local
  history, an assessment and battery level/temperature snapshots when available.
- Visible automatic upload option, separate public-sharing consent, persistent
  local outbox, account connection and retry. Unsent reports stay on the phone.

Remote reports label Android as **request-client**, never as the inference host.
The endpoint is not exported. This preview accepts loopback or private IPv4 LAN
origins only; it does not send benchmarks to arbitrary public hosts or follow HTTP
redirects. Do not expose an unauthenticated model server to the public internet.

Android Pro activation is not enabled in this preview. Desktop/CLI retain the
existing 20-job Pro validation. Core labels have the existing 20-language selector;
new controls have English and both Chinese translations, with English fallback
elsewhere. Technical assessments are currently English.

## Build

Install JDK 17, Android SDK platform 35 and build-tools 35.0.0. No Gradle/Maven or
third-party app libraries are required.

```sh
export ANDROID_SDK_ROOT=/path/to/android/sdk
export JAVA_HOME=/path/to/jdk17
bash android/build.sh
```

Output: `android/build/TokFireBench-0.7.0-android-preview.apk` and SHA-256.
This is a **debuggable development APK**, signed with a dedicated development key
in `~/.android/tokfire-dev/`, not a Google Play/production release. Do not commit the
key. CI artifacts use a different development key and may require uninstalling the
local build before installation; uninstalling removes its local reports.

## Tests

`bash android/test-build.sh` builds a separate instrumentation APK. The test uses
a protocol fixture server mapped with `adb reverse tcp:8767 tcp:HOST_PORT`:

```sh
adb install -r android/build/TokFireBench-0.7.0-android-preview.apk
adb install -r android/build/tests/qa.apk
adb shell am instrument -w com.tokfire.bench.tests/com.tokfire.bench.Instrumentation
```

Fixture tests are UI/protocol checks, **not phone performance results**. Physical
Android inference, battery/thermal accuracy, GPU/NPU support and OEM-specific
behavior require a real phone and compatible runtime. Hermes/OpenClaw integrations,
power profiling, model download/embedding and production signing remain future work.
