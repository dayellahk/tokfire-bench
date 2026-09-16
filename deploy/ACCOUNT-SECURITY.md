# Account security

The web portal uses Cloudflare Turnstile and optional TOTP two-factor authentication through Better Auth 1.7.3.

## Configuration and migration

Set TURNSTILE_SITE_KEY, TURNSTILE_SECRET and TURNSTILE_HOSTNAMES in the existing server environment. Only the site key is returned by /api/signin-options. Production must allow only tokfires.com; never add localhost to the production hostname allowlist. Missing or invalid verification fails closed.

Back up MySQL before enabling this release. With the existing environment loaded, run `node --experimental-strip-types deploy/migrate.mjs`. Better Auth adds user.twoFactorEnabled and the twoFactor table. Preserve BETTER_AUTH_SECRET: it encrypts the stored TOTP secrets and recovery codes. Backups must retain this secret separately in the existing secret store.

## User flow

Sign in → Account security → Set up two-factor authentication → scan the locally generated QR code → save recovery codes → confirm a six-digit code. Enrollment does not protect the account until confirmed. Each recovery code can be used once. Password and Google sign-ins both create only a pending challenge until the second factor succeeds. The OAuth gate is a tested extension of Better Auth's password-only default hook; rerun auth-security tests on dependency upgrades.

Security changes require a session created within five minutes. Password accounts additionally require their password. Google-only accounts reauthenticate through Google. No remembered-device option is shown. Users may regenerate recovery codes or disable 2FA after fresh authentication. Existing sessions are not globally revoked by enrollment. Email recovery is not configured; retain the recovery codes.

## Abuse controls and validation

Server-side Siteverify checks success, action and exact hostname. Every submission resets the widget; tokens expire and are single-use. Authentication rate limiting is backed by MySQL. Two-factor challenges expire after ten minutes; failed-code limits and account lockouts are enabled. Guest benchmark upload authorization remains independent of web login.

Run `node --experimental-strip-types --test tests/*.test.mjs`, TypeScript and the portal workflow lint check. Tests exercise encrypted storage, enrollment confirmation, password/Google pending sessions, invalid codes, exhausted challenges, recovery-code replay and fresh-session requirements. Production validation additionally needs a real Turnstile token accepted once and rejected on replay; test credentials must use an isolated cookie jar, not replace a user's browser session.
