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
