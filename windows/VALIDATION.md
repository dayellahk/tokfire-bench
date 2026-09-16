# Windows Preview validation — 2026-09-16

Version 0.6.0, Windows x64. Built on Apple Silicon macOS with .NET SDK 10.0.302.

Completed:

- Release build: zero warnings/errors after removing the unused WPF reference.
- Self-contained Windows publish: Windows PE32+ GUI executable and x64 runtime, runner resources and WebView2 loader present.
- 28 Python tests: shared runner, overlap of 20 job requests, license rules, Windows CIM field filtering, Windows termination branch, temporary-directory cleanup ordering. Windows API calls are mocked on macOS.
- 16 Node tests: existing Mac contracts, privacy, per-job timing consistency and a synthetic Windows report contract. Synthetic Windows fixtures are not performance measurements.
- C# logic smoke test: per-job commentary and small-model catalogue filtering.
- TypeScript and Linux production builds pass.
- 21 deployed HTTPS/MySQL checks pass, including synthetic Windows storage, ownership, privacy and deletion; QA accounts/data removed.
- Live homepage plus 11 CSS/JavaScript/icon assets pass. Ego Browser confirms the Windows download link and styled page.
- Portable ZIP integrity and SHA-256 generated. Runtime dependency license notices included.

Pending on a real Windows device:

- Launch and layout at 100%, 150% and 200% scaling; accessibility/RTL layout.
- WMI hardware discovery and NVIDIA/AMD/Intel CPU/GPU inference with compatible llama.cpp builds.
- One-, two- and three-job live progress, failure, cancellation, and app-close cleanup (no orphaned llama-server process).
- WebView2 login, reconnect, upload retry, cookies and account sign-out.
- Local DPAPI storage and live license activation/deactivation when seller setup is complete.
- Windows-specific prose and report translations; currently English.
- Authenticode signing and installer.

GitHub Windows CI passed on 2026-09-16: actual Windows CIM probe, concurrency/lifecycle unit tests, C# report/catalogue tests, Windows publish, finalized-ZIP integrity and artifact upload. Run: https://github.com/dayellahk/tokfire-bench/actions/runs/35045389981 . This does not test the interactive GUI, WebView2 sign-in or real GPU inference. The website download remains the original checksum-verified cross-compiled preview.
