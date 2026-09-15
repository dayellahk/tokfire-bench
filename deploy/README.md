# TokFire Bench on Linode

Target: ServerAvatar-managed Linode Nanode 1GB, Singapore 2, US$5/month before tax or existing panel fees. Node.js 22, Nginx and MySQL run on the same VM. Inference stays on each user's Mac. A 2GB swap file provides headroom; it does not replace RAM.

The independent website uses Better Auth email/password sessions. It does not trust Sites authentication headers. Passwords are hashed by Better Auth; MySQL is loopback-only. Configure DATABASE_URL, BETTER_AUTH_SECRET and BETTER_AUTH_URL in a root-readable environment file, never in Git or public assets.

1. Install dependencies with the committed pnpm lockfile. Build on Linux with `NODE_OPTIONS=--max-old-space-size=1024 pnpm build`.
2. Load the environment, run `node deploy/migrate.mjs` then `node deploy/seed.mjs`.
3. Copy `.next/standalone`, `.next/static` and `public` into the release directory. Run the provided systemd service as the unprivileged tokfire user.
4. Nginx terminates HTTPS and proxies to 127.0.0.1:3000. Only 80/443 and SSH need external access. Forward the actual client IP and HTTPS scheme.
5. Run `TEST_ORIGIN=... node deploy/smoke.mjs` with DATABASE_URL set. It creates and deletes two isolated QA accounts and reports, checks authentication, ownership, CSRF and duplicate uploads.
6. Keep database backups outside the release directory. A local backup does not protect against losing the VM; offsite storage is a separate future configuration.

Existing Sites production database was inspected before migration: submissions, measurements, benchmark_results and external_benchmarks were all empty. Existing Site remains available as a rollback reference. The bundled, attributed oMLX reference snapshot contains 200 rows; these are references, not community submissions.

Limitations: outgoing email/password recovery is not configured. Pro live payments await Lemon Squeezy merchant activation. The macOS DMG is ad-hoc signed and not notarized.
