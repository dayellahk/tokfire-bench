# TokFire Bench

A macOS local-LLM benchmark alpha and a website for consent-controlled result storage and comparisons.

- `native/`: SwiftUI macOS source, local Python runner, build script and native instructions.
- `app/`: website and API routes.
- `lib/benchmark.ts`: strict shared report contract, median metrics and comparison identity.
- `lib/repository.ts`: database operations with ownership constraints.
- `db/schema.ts`, `drizzle/`: D1 schema and append-only migrations.
- `tests/`: backend contract and SQLite tests.
- `docs/IMPLEMENTATION.md`: delivered behavior, API, validation limits and release gates.

This is a developer alpha. The previous simulated results and invented leaderboard have been removed. There is no consumer-ready signed Mac installer, calibrated overall score or independently verified hardware database yet.

## Web development

Use the pinned pnpm manager in `package.json` and its lockfile. In a portable development checkout with the appropriate Node version, install dependencies and run `pnpm dev`. Hosted builds use the existing Sites helpers and `.openai/hosting.json`. Keep the project identity and migration history intact.

The repository tests use Node 24's built-in TypeScript stripping and SQLite:

```sh
node --test tests/backend.test.mjs
python3 -m unittest discover -s native/Tests -v
node node_modules/typescript/bin/tsc --noEmit
npm run lint
```

See `native/README.md` for building the Mac client. For tests/builds in a Sites execution environment use the installed Sites workflow. Do not run database schema creation at request time. Production schema changes are generated with `npm run db:generate` and applied by publishing.

## Storage and access

Uploaded records live in D1; native reports remain local until the user explicitly submits in the browser. Collection and publication have separate controls. Authenticated users can withdraw publication or delete their reports. Current hosting remains owner-private. Do not embed private-site access tokens in the native app.

## References

llama.cpp server API: https://github.com/ggml-org/llama.cpp/tree/master/tools/server

The first release integrates llama.cpp only. MLX support requires its own runtime adapter and comparison groups.
