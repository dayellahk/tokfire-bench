# macOS test report — Local AI Bench 0.2.1

Date: 15 September 2026. Tested locally on the user's Apple M2 Max, 12 CPU cores, 96 GiB memory, macOS 26.5.2. Swift 6.3.3. This is an ad-hoc signed developer build, not Developer ID signed or notarized.

## Delivered

- `build/LocalAIBench-0.2.1-macos-arm64.dmg`: compressed, read-only disk image, verified by hdiutil, mounted and inspected. Contains the app, Applications shortcut and setup instructions.
- App launched from the mounted DMG; live sampling showed its native macOS event loop. Automated button/file-dialog and visual inspection remain unverified because macOS denied Accessibility and screen capture access.
- Python 3.10+, llama-server and model weights remain external dependencies. Homebrew llama.cpp 0.4.0 and its dependencies were installed on this Mac; existing Homebrew Python was used. Model download lives in `~/Library/Application Support/LocalAIBench/Models/`.
- No benchmark reports were uploaded. Website changes, deployment and authenticated upload tests were outside this task.

## Real inference

Official MiniCPM5-2B Q4_K_M, 1,561,318,368 bytes. The pinned download checksum passed.

Model SHA-256: `ec2d5801640099e97d8d7e8003ad4d81f336e757811f03a26173dddf386602fd`

Runtime: llama.cpp 0.4.0, build 10809, commit 5266f24da.

Executable SHA-256: `8939a1cf8a4e9a5cc18d6cd4d2d55440b48f8a44db00abe459a28d837ea051f7`

This runtime uses external dynamic libraries; the executable hash does not attest their content.

| Measurement | Short trial | Standard, 512 input | Standard, 2,048 input |
|---|---:|---:|---:|
| Output tokens | 32 | 128 | 128 |
| Retained samples | 1 | 3 | 3 |
| Decode tokens/sec | 52.24 | 47.99 | 41.08 |
| TTFT, ms | 877.83 | 785.04 | 3,357.23 |
| Prefill tokens/sec | 584.85 | 653.84 | 610.42 |

Standard figures are per-metric medians. One discarded warm-up preceded each workload. All exact-token, no-cache and timing validations passed. Runtime log timing values matched exported measurements. Model load was 29,024.55 ms for the first trial and 831.93 ms for the later standard run; these include different cache/compiler states and must not be compared as cold-load results. Standard peak process RSS: 1.763 GiB, **not total GPU/unified memory**.

A separate real-inference diagnostic trial with verbose logging confirmed `offloaded 43/43 layers to GPU`, Metal device `Apple M2 Max`, and flash attention disabled. It produced Metal compute pipeline activity. Diagnostic output is in `build/evidence/metal-runtime.log`; it remains local and is not embedded in reports.

## Checks passed

- Native Swift release compilation.
- 16/16 Python tests on macOS, including synthetic three-model sequential ordering.
- Real trial and full one-model standard benchmark; six standard samples retained.
- Actual Swift BenchController run with the real Python/runtime/model: progress, completion, summary, report JSON readback and trial state succeeded. This uses the controller source in a harness, not automated UI clicks.
- Interpreter-level failure is now displayed by the controller, verified with an incompatible interpreter.
- Real CLI cancellation while loading and during generation: exit 130, model server reaped, no partial report saved.
- DMG checksums, mounted app signature and Info.plist verification.
- Launch of the app directly from the read-only mounted image.

## Fixes

1. Canonicalized temporary test paths: macOS `/var` resolves to `/private/var`, previously causing the three-model test to miss child processes.
2. Preserved and surfaced Python stderr in the Swift controller instead of discarding it.
3. Raised runtime version-check timeout from 20 to 180 seconds. Sampling confirmed first-launch Metal shader compilation can exceed 20 seconds even for `--version`.
4. Added reproducible `build-dmg.sh` packaging and ad-hoc app signing. Signing stages in `/private/tmp` because iCloud/Finder metadata in Documents caused codesign rejection; security/quarantine attributes are preserved.
5. Used existing Homebrew Python for the verified model download after the separate python.org installation failed TLS certificate validation. Certificate verification was never disabled.

## Remaining coverage

Manual window appearance, Choose buttons, export save dialog, Stop button and quitting during a benchmark still need interactive testing. CLI cancellation and the actual Swift controller were exercised, but do not substitute for these UI interactions. Only one actual model was downloaded; three distinct real-model runs remain untested, while synthetic sequential-process tests passed. No calibrated score, sustained/thermal testing, signing/notarization, runtime bundling or website submission verification is claimed.

## Evidence

`build/evidence/` contains trial/standard JSON, runtime logs, cancellation logs, Swift controller test output and harness, packaged-app sampling, DMG mount output and Python test results. Detailed runtime logs can include local paths and synthetic benchmark content; the JSON reports omit these.

Rebuild: `bash build-dmg.sh` from this native directory.
