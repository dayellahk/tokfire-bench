# TokFire Bench deployment — 16 September 2026 (Hong Kong)

- Website: https://tokfires.com
- Provider: Linode, Singapore 2 (sg-sin-2), Nanode 1GB.
- VM: US$5/month, 1 vCPU, 1GB RAM, 25GB SSD, 1TB included transfer. Existing ServerAvatar fees and tax are separate. No paid backup addon enabled.
- IP: 104.64.207.84. ServerAvatar server 42912, application 154869, database 122831.
- Runtime: Ubuntu 24.04, Node 22.23.2, Next 16.3.4, Nginx, MySQL 8.0.46. No GPU/model inference on the VM.
- Dedicated MySQL database: tokfire_bench. MySQL and the Node listener are loopback-only. Firewall permits SSH, HTTP/HTTPS and the ServerAvatar management port.
- Auth: Better Auth email/password, secure HttpOnly cookies, database sessions and rate limits. Sites identity headers cannot authenticate a caller. Email verification/password recovery are not configured.
- Imported 100 oMLX performance and 100 intelligence reference rows from the attributed bundled snapshot. These are separate from community measurements.
- Old Sites production tables were inspected and empty. Old Site remains intact; DNS now targets Linode.
- HTTPS: Let's Encrypt certificate valid until 14 December 2026; webroot renewal simulation passed. certbot.timer is enabled; a deploy hook reloads Nginx.
- Backups: daily MySQL dump on this VM, gzip verified, seven-day retention. First backup succeeded. Offsite backup and a full restore drill are not configured.

## Validation

- Linux production build and TypeScript check passed. Build heap is 1024MB with swap; runtime heap is capped at 384MB.
- 8 backend contract/security tests and 7 serving/concurrency report tests passed.
- 17 live deployment checks passed: health, forged identity rejection, two account registrations, secure cookies, sessions, CSRF, real concurrent report upload, duplicate retry, ownership isolation, deletion, sign-out and password sign-in. QA accounts/reports were removed.
- Public HTTPS endpoints and 200 reference rows verified. Restarting MySQL and the app restored healthy service; all 200 references persisted, and QA account/report counts were zero.
- Live DMG download matched local SHA-256: c15fd9c99b783f0209276cf31966f0e38fdc80240be6ccbc5b7b2ab42efa7c5c.
- macOS 0.5.2 compiled, ad-hoc signature verified and DMG checksum verified. It connects to tokfires.com. It is not Apple notarized.
- Final native WebKit upload test could not start: process sampling showed WKWebView initialization blocked waiting for the macOS pasteboard service. Ego Lite's runtime also stopped responding. This GUI check remains pending; permission to restart the clipboard service was requested because that clears its contents.

## Operation

Application unit: tokfire.service. Active release: /opt/tokfire/current, linked to /opt/tokfire/releases/0.5.2-r2. Source: /opt/tokfire-source. Secret configuration: /etc/tokfire.env (root-readable only). No secrets are included in this repository.

The Nginx reverse proxy is maintained by deploy/tokfire-nginx.conf. Preserve it when using ServerAvatar domain/SSL tools; regenerating a PHP vhost would replace the Node proxy. Certificate renewal is handled by certbot, so the panel's SSL metadata may not reflect the installed certificate.

Pro live sales still await Lemon Squeezy merchant activation. This deployment does not enable live license purchases.


## Windows preview update — 2026-09-16

- Live release: `/opt/tokfire/releases/0.6.0`; prior `0.5.2-r2` retained.
- Added separate strict `local-ai-windows-jobs-v1` upload schema. Mac profiles retain their validation rules. No database table migration needed.
- Windows x64 self-contained .NET preview ZIP is served at `/TokFireBench-0.6.0-windows-x64.zip`. SHA-256: `5c482882dd94a32d49b40ee325fb99d1545f0d12930e44d48562a807a925680a`.
- 21 live HTTPS/MySQL smoke checks passed. Windows report was synthetic, private, retrieved and deleted; QA accounts removed. The initial smoke call raced service startup; after readiness returned HTTP 200 the full suite passed.
- Homepage and 11 CSS/JS/icon assets passed. Nginx continues proxying static assets to Next.js; the previous inaccessible filesystem alias was not restored.
- Windows build is unsigned and has not been executed on Windows. See `windows/VALIDATION.md` for remaining native GUI, GPU, login and cancellation checks. Mac DMG remains version 0.5.2.
- SMTP/email verification/password reset provider is still unconfigured. Lemon Squeezy live product/activation remains pending merchant setup.

## Multilingual portal, GitHub and Cloudflare mirror — 2026-09-16

- Primary release: `/opt/tokfire/releases/0.6.1-i18n-r3`. English, Traditional Chinese (`/zh-Hant`) and Simplified Chinese (`/zh-Hans`) include home/comparison/data UI, sign-in, methodology, references and native account connection.
- `/sitemap.xml` lists nine public URLs with language alternates. `/robots.txt` references it. Sign-in/native-connect have noindex metadata and are omitted from the sitemap.
- Verified 15 language/page routes, HTML language, canonical/hreflang, account noindex and 404 behavior. Homepage plus 12 stylesheet/script/icon assets pass. A clean Next.js build resolved stale CSS from the initial incremental build.
- GitHub repository: https://github.com/dayellahk/tokfire-bench (private, default branch main). Source history uploaded; no database contents, real env files or credentials are tracked. Credential-pattern inspection of 482 Git objects found only the deliberate `deploy/env.example` placeholder.
- Cloudflare Pages: https://tokfire-bench.pages.dev . Public pages mirror the main website; account/reference/data actions and installers link to the primary domain. Canonical URLs and sitemap retain the primary domain. See `CLOUDFLARE-STATIC.md` for explicit re-sync commands. No main-domain DNS or database migration was performed.

- The desktop connection callback page keeps its existing URL to preserve compatibility with the released Mac client; language selection remains available on the portal and sign-in pages.
- Windows CI passed on GitHub after ZIP validation was moved after archive close: https://github.com/dayellahk/tokfire-bench/actions/runs/35045389981 . This covers build/packaging and automated tests, not interactive GUI or GPU inference.

## Hardware-first rankings — 16 September 2026

- Live release: `/opt/tokfire/releases/0.7.0-finder-build19`. Previous cyber release retained at `/opt/tokfire/releases/0.7.0-cyber-build17`.
- Rankings now lead with chip/GPU/model search, platform, exact tested RAM and intended workload. Matching uses every search term, excludes remote request-client hardware, and requires measured agent job levels. Failed results remain visible; passing grades sort first without a new synthetic score.
- Compact evidence cards show hardware/model, workload grade, completed tasks, measured smooth-job capacity and the slowest request at an identified job level. Detailed reports expand on demand. Coverage counts describe the returned latest-50-report window.
- Contribution section explains why testing one's own machine matters, links to localized installers and describes optional guest/public sharing. Starter setups, historical profiles and local JSON preview are secondary expandable sections. EN, Traditional Chinese and Simplified Chinese copy updated.
- Validation: 61 automated tests pass (including four finder behavior tests); TypeScript, focused ESLint and Linux production build pass. Browser checks verified search, platform/agent/parallel filters, empty results, expanded evidence, local report preview and localized download navigation. Light/dark desktop and 390 px mobile checked without horizontal overflow. Live assets and translated route/sitemap checks pass.
- No database/schema, benchmark thresholds, upload permissions or raw-reference publishing changes. Existing report integrity and privacy boundaries remain in effect.
