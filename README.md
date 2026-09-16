# TokFire Bench

## 0.7 workload preview

Native macOS and Windows apps now include fixed chat/business/long-context and bounded agent-tool workloads, concurrency sweeps, failure-aware reports and latency tails. A native Android benchmark-client APK and Linux/cross-platform Python CLI are included.

- [Framework review and delivered/deferred scope](docs/V0.7-FRAMEWORK-REVIEW.md)
- [Validation and real Mac results](docs/V0.7-VALIDATION.md)
- [Android build, runtime requirements and preview limits](android/README.md)
- [Linux and cross-platform CLI](cli/README.md)

Android requires an existing on-device or explicitly selected LAN model runtime; weights and an inference engine are not bundled. Agent tests use local fixtures, not Hermes/OpenClaw integration. Development builds are not production-signed.


Local AI benchmarks for macOS and Windows, with a guest-upload web portal and optional accounts by **TokFire Labs**.

Website: https://tokfires.com

Web portal languages: English (`/`), Traditional Chinese (`/zh-Hant`) and Simplified Chinese (`/zh-Hans`). Public routes are listed in `/sitemap.xml` with language alternates; `/robots.txt` excludes account and API routes.

## Applications

- **macOS 0.7.0:** SwiftUI app for Apple Silicon, llama.cpp/GGUF, oMLX/MLX and existing local Ollama/vLLM servers. Ad-hoc signed developer preview; not Apple notarized.
- **Windows x64 0.7.0:** self-contained .NET desktop preview for Windows 10/11 and llama.cpp/GGUF. Cross-compiled on macOS; native Windows GUI/GPU testing remains pending. See [Windows setup](windows/README.md) and [validation status](windows/VALIDATION.md).
- Free users can choose 1–3 simultaneous jobs calling the **same model**. Planned Pro license: HK$180 once, one activated device, up to 20 jobs. Live sales/activation await Lemon Squeezy merchant/product setup.
- Python and compatible inference runtimes are installed separately. Model weights are not bundled.

## Repository

| Folder | Contents |
| --- | --- |
| `native/` | SwiftUI Mac app, shared Python runners and tests |
| `windows/` | Windows desktop app, packaging and validation notes |
| `android/`, `cli/` | Native Android benchmark client and portable Python runner |
| `app/`, `components/`, `lib/` | Next.js web portal, report validation and APIs |
| `deploy/` | MySQL schema, Linux/systemd/Nginx deployment and smoke checks |
| `tests/` | Report contract and ownership/privacy tests |
| `public/` | Branding and downloadable preview artifacts |

The current deployment uses Node.js, Next.js, Nginx and MySQL on Linode. Inference happens on the user's device. Historical Sites/Cloudflare helpers and migrations remain for provenance; they are not the live hosting configuration.

## Cloudflare static mirror

https://tokfire-bench.pages.dev contains synchronized public pages. Login, uploads and live data remain on tokfires.com. See [export and deployment instructions](deploy/CLOUDFLARE-STATIC.md).

## Web development

Use Node.js 22.13+ (Node 24+ for the test suite), pnpm as pinned in `package.json`, and a local MySQL database.

```sh
pnpm install --frozen-lockfile
# Copy deploy/env.example to .env.local and replace its placeholders.
node --env-file=.env.local deploy/migrate.mjs
node --env-file=.env.local deploy/seed.mjs
pnpm dev
```

Never commit real environment files, database passwords, private keys, session cookies or license credentials. The production database is not included in this repository.

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s native/Tests
pnpm exec tsc --noEmit
pnpm build
```

See [Linux deployment](deploy/README.md). The deployment smoke test creates and deletes isolated QA accounts; only run it against a database you control.

## Desktop builds

See [macOS instructions](native/README.md). For Windows, install .NET SDK 10:

```sh
dotnet publish windows/TokFire.Bench.csproj -c Release -r win-x64 --self-contained true -o windows/publish/win-x64
python3 windows/package.py
```

GitHub Actions workflows provide Mac compilation and Windows preview build jobs. A successful build is not proof of working GPU inference or interactive GUI behavior.

## Data and limitations

Automatic desktop upload is visible before Run and enabled by default. Public sharing is separate and off by default. Failed/offline uploads remain queued locally. Authenticated users can retrieve, withdraw publication of, or delete their reports. Windows, Mac concurrent, oMLX, trial and standard report profiles remain distinct.

The 100–200 tok/s target is user-selected, not a measured guarantee of a ChatGPT plan. Measurements do not assess answer quality. Community submissions are not hardware attestations. Public comparisons show only consented TokFire measurements. Internal external-reference snapshots are excluded from public routes and source downloads.

SMTP/email verification/password recovery is not configured yet. Do not describe the previews as production-ready.


Guest upload flow: no account is required. The live website and native upload page
establish a device-local guest credential; publication remains opt-in. See
[guest upload details](docs/GUEST-UPLOADS.md).

### Guest upload protection

Online 0.7 workload tests use one-time run challenges, replay receipts, durable rate limits and quarantine. No login is required. Challenge checks are not hardware attestation. See [design and retention](docs/UPLOAD-INTEGRITY.md) and [validation](docs/UPLOAD-INTEGRITY-VALIDATION.md).
