# Google sign-in on TokFire

Google web sign-in uses Better Auth's authorization-code flow, with PKCE,
state cookies and server-side token verification. Guest benchmark uploads remain
available without login. Apple is deferred until an Apple Developer account is
available; no Apple button or simulated authentication is enabled.

## Google Cloud setup

1. Select the approved project in Google Auth Platform.
2. Set the consent-screen name to **TokFire Bench**, use the owner's support
   email, and select an external audience. Shared projects share this branding.
3. Create an OAuth client of type **Web application**, named **TokFire Bench Web**.
4. Authorized JavaScript origin: `https://tokfires.com`.
5. Authorized redirect URI: `https://tokfires.com/api/auth/callback/google`.
   The URI has no locale prefix and no trailing slash.
6. Use only `openid`, `email`, and `profile`. Gmail/Drive and offline API access
   are not needed. For public access, review the Audience publishing status;
   complete any Google verification requirements shown in the console.
7. Save the client ID and secret directly in `/etc/tokfire.env` on the VM:
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Keep the file root-readable
   only. Never put credentials in Git, NEXT_PUBLIC variables, screenshots or chat.
8. Restart `tokfire`. `GET /api/signin-options` returns only `{google:true}` when
   both values exist. It does not check Google's validity or publishing status.
9. Test a real login, cancel, sign-out, and returning login on tokfires.com.
   A local/mock authorization test is not proof of a real provider sign-in.

## Account behavior

A new Google identity creates an account; subsequent sign-ins use its provider
ID. Password accounts are not silently linked by email. If an email already
belongs to an account, the user must use the original sign-in method. This is
intentional while email verification is not available. Guest-owned reports are
not automatically transferred to a newly signed-in account. Provider access and
refresh tokens are encrypted by Better Auth with BETTER_AUTH_SECRET; keep that
secret stable and backed up securely. Password reset still needs email delivery.

The Cloudflare static mirror redirects sign-in to tokfires.com. OAuth is handled
by the existing Node/MySQL server; no secrets are shipped with the static site.

## Validation

`node --experimental-strip-types --test tests/social-auth.test.mjs tests/guest.test.mjs`

Tests cover unavailable configuration, credential-free readiness, hostile return
paths, exact Google scopes and callback, PKCE/state, rejected external origins
with browser cookies, rejected callback destinations and forged callback states.

References: https://better-auth.com/docs/authentication/google and
https://developers.google.com/identity/protocols/oauth2/web-server
