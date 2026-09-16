# Guest uploads — 16 September 2026

Uploads no longer require an account. Opening the live portal or its native upload
page creates a random 256-bit guest cookie (Secure on HTTPS, HttpOnly, SameSite=Strict).
API-only clients can POST `/api/guest` and preserve its Set-Cookie response. The token
never travels in a URL or report. The database owner is a domain-separated SHA-256
of that credential, not a hardware identifier. Signed-in accounts remain supported.

Only the owning guest credential or account can list, delete or change publication
of reports. Knowing a run ID or submission ID grants no access. Collection consent,
strict report validation, body-size limits, per-owner 20/hour quota, origin checks
and public/private separation remain in force. This is pseudonymous ownership, not
hardware attestation or protection against all Sybil submissions. Contributor counts
represent submission identities, not verified people.

The credential is stored in website data in the browser/app. Another browser is a
separate guest. Clearing app/website data or losing the cookie removes management
access; local report files remain. No automatic account merge or identity recovery
is claimed. The credential cookie lasts one year; its loss is explained in the UI.

Mac automatically establishes the guest session when enqueueing or reopening with
pending reports. Windows prepares its WebView upload connection on demand. Android
prepares its WebView in the background. Management uses the same app's web view.
No email, password, account registration or login confirmation is required. The
optional sign-in page remains available for account-owned uploads.

Guest uploads do not alter prior publication choices. Existing pending reports
remain private. Public sharing is selected before Run or later in My data. Local
oMLX runtime measurements remain valid TokFire results; external reference data
stays off public routes and downloads.

Verification: backend unit tests for credential generation/parsing, independent
owners and origin rejection; live `deploy/guest-smoke.mjs` checks two independent
guest sessions, private upload/list, idempotent retry, duplicate ownership conflict,
public-feed exclusion, cross-guest mutation denial, CSRF and cleanup. Temporary QA
reports are never published. Desktop/Android build validation does not imply native
Windows hardware or Android on-device LLM performance testing.

## Live validation and recovery

41 backend unit tests, 18 live guest API checks, TypeScript and targeted lint pass.
A real Mac WKWebView test uploaded, listed and deleted a private QA report with no
sign-in. Mac DMG, Windows x64 ZIP and Android preview APK builds pass; Windows GUI
and Android guest WebView automation have not been exercised on physical devices.

Recovered 12 original Mac reports through the Ego guest session, verified each
stored JSON against its local original, then removed only acknowledged queue
envelopes. The database has 12 guest-owned private reports, zero public reports and
zero user accounts. Keep the Ego website data to manage these recovered reports;
another browser or the desktop app has a separate guest identity. No report was
automatically published.
