# TokFire Bench

Local AI benchmarks by **TokFire Labs**. Find a model for your computer, test it on your own hardware, and optionally contribute results without creating an account.

**[Website](https://tokfires.com) · [Hardware and model rankings](https://tokfires.com/?tab=rankings)**

## New in 0.8: verified agent workflow simulations

Go beyond tokens per second: test whether a local model finishes a useful task, how long it takes, and what happens when multiple jobs call the **same model**.

| Test | What the model must do | What the report checks |
| --- | --- | --- |
| CSV analysis | Read data, filter invalid rows and write a report | Row counts, totals and regional breakdowns |
| Research | Read three local page snapshots and select a qualifying plan | Correct choice and evidence from every source |
| Error recovery | Recover from service errors and an uncertain reservation response | Safe retries, exactly one reservation and a correct receipt |

Choose 1, 2 or 3 concurrent jobs, or a concurrency sweep. Reports show task success, passed checks, task duration, retries and errors. Failures and timeouts stay in the results. Existing chat, business, long-context and agent-tool workloads remain available.

These are bounded simulations with reproducible checks. **They do not run Hermes, OpenClaw, Pi, Claude Code or Codex.** They help compare models under matching conditions; actual agent performance still needs validation with those tools. See [test design and limitations](docs/AGENT-SIMULATIONS.md).

### Download previews

| Platform | Download | Status |
| --- | --- | --- |
| macOS Apple Silicon | [0.8.0 DMG](https://tokfires.com/TokFireBench-0.8.0-macos-arm64.dmg) | macOS 13+; ad-hoc signed, not notarized |
| Windows x64 | [0.8.0 ZIP](https://tokfires.com/TokFireBench-0.8.0-windows-x64.zip) | Unsigned desktop preview; native GUI/GPU validation pending |
| Linux / cross-platform | [0.8.0 Python CLI](https://tokfires.com/TokFireBench-0.8.0-cli.tar.gz) | Python 3.10+ and a compatible model endpoint |
| Android | [0.7.0 APK](https://tokfires.com/TokFireBench-0.7.0-android-preview.apk) | Original four workloads; new 0.8 simulations not yet included |

Python and inference runtimes are installed separately for desktop/CLI use. Model weights are not bundled. Android requires an existing on-device or explicitly selected LAN model runtime. These are development previews.

- [macOS setup](native/README.md) · [Windows setup](windows/README.md)
- [Android requirements](android/README.md) · [CLI instructions](cli/README.md)
- [Earlier 0.7 framework scope](docs/V0.7-FRAMEWORK-REVIEW.md) · [Earlier 0.7 validation](docs/V0.7-VALIDATION.md)

Web portal languages: English (`/`), Traditional Chinese (`/zh-Hant`) and Simplified Chinese (`/zh-Hans`). Public routes are listed in `/sitemap.xml` with language alternates; `/robots.txt` excludes account and API routes.

## Applications

- **macOS 0.8.0:** SwiftUI app for Apple Silicon, llama.cpp/GGUF, oMLX/MLX and existing local Ollama/vLLM servers. Ad-hoc signed developer preview; not Apple notarized.
- **Windows x64 0.8.0:** self-contained .NET desktop preview for Windows 10/11 and llama.cpp/GGUF. Cross-compiled on macOS; native Windows GUI/GPU testing remains pending. See [Windows setup](windows/README.md) and [validation status](windows/VALIDATION.md).
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

## Web development

Use Node.js 22.13+ (CI uses Node 22 with explicit TypeScript stripping), pnpm as pinned in `package.json`, and a local MySQL database.

```sh
pnpm install --frozen-lockfile
# Copy deploy/env.example to .env.local and replace its placeholders.
node --experimental-strip-types --env-file=.env.local deploy/migrate.mjs
pnpm dev
```

Never commit real environment files, database passwords, private keys, session cookies or license credentials. The production database is not included in this repository.

```sh
node --experimental-strip-types --test tests/*.test.mjs
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

The 100–200 tok/s target is user-selected, not a measured guarantee of a ChatGPT plan. Throughput alone does not assess answer quality. The 0.8 simulations verify specific task outcomes, not general model intelligence. Community submissions are not hardware attestations. Public comparisons show only consented TokFire measurements. Internal external-reference snapshots are excluded from public routes and source downloads.

SMTP/email verification/password recovery is not configured yet. Do not describe the previews as production-ready.


Guest upload flow: no account is required. The live website and native upload page
establish a device-local guest credential; publication remains opt-in. See
[guest upload details](docs/GUEST-UPLOADS.md).

### Guest upload protection

Online workload tests use one-time run challenges, replay receipts, durable rate limits and quarantine. No login is required. Challenge checks are not hardware attestation. See [design and retention](docs/UPLOAD-INTEGRITY.md) and [validation](docs/UPLOAD-INTEGRITY-VALIDATION.md).
