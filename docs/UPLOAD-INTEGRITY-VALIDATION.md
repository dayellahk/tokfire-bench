# Upload integrity validation — 2026-09-16

- 50 backend tests passed: owner/config binding, expiry, single use, transactional rollback, identical retries, copied measurements with new IDs, replay after deletion, both guest and IP quotas, quarantine and legacy leaderboard exclusion.
- 45 Python tests passed, including the actual prompt prefix and nonce-dependent agent order fixture.
- TypeScript check, targeted ESLint and production Next.js build passed.
- Live MySQL smoke: 15 challenge/race/replay/quarantine/privacy checks and 18 existing guest-session checks passed. All QA submissions were private and deleted afterwards.
- Real Apple M2 Max + MiniCPM5-2B GGUF + llama.cpp, one agent job with three repeats: local runtime → server ticket → guest upload → `challenge-checked` → private listing → deletion passed. The tested model failed the bounded agent workflow; those failures were retained, not turned into successful agent scores.
- Native macOS integration `UploadTests.testRealChallengeRunAndGuestUpload` passed in 10.296 s. Guest cookies remain managed by WebKit; ticket/upload HTTP now uses URLSession to avoid suspended background JavaScript promises.
- macOS DMG checksum/signature verification, Windows x64 cross-build and Android APK signing verification passed. Windows and Android physical device upload behavior has not been tested in this task.
- Existing 12 private reports and all publication choices remain unchanged; no generated QA measurements were made public.
- Main portal: Linode / MySQL. Cloudflare Pages deployment: `8824c158`; static mirror links data operations and downloads to the main portal.

Known limits: challenge checks do not attest hardware or execution. No independent-device baseline or automatic controlled-verification badge has been introduced. Pending review is an operator decision. See UPLOAD-INTEGRITY.md for policy and retention.
