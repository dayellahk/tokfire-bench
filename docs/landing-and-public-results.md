# Landing and public results — 16 September 2026

The homepage now explains local inference, shows a generated hardware illustration, offers six Qwen3.8-27B starting configurations, and links directly to the existing app downloads. English, Traditional Chinese and Simplified Chinese are rendered on the server. The same shortlist is available on the comparison page, separate from measured workload grades.

## Evidence and boundaries

- [Qwen model](https://huggingface.co/Qwen/Qwen3.8-27B)
- [ISTA-DASLab quantization card](https://huggingface.co/ISTA-DASLab/Qwen3.8-27B-GSQ-RCO-GGUF): IQ3_S 11.8 GB download, BF16 53.8 GB. File size is not total runtime memory. Optional MTP and vision components are additional. Selected reported quality evaluations do not establish universal losslessness.
- [MLX community model files](https://huggingface.co/mlx-community/Qwen3.8-27B-4bit/tree/main): approximately 16.1 GB repository. This is a different quantization from GSQ-RCO.
- [NVIDIA 5060 family](https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5060-family/), [4090](https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4090/), [5090](https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5090/): the selected GPU capacities are 16, 24 and 32 GB. The 4090 recommendation targets an existing rig.
- [Mac mini](https://www.apple.com/mac-mini/specs/) and [Mac Studio](https://www.apple.com/mac-studio/specs/): configurations checked on the date above; M5 Pro 48 GB, M5 Max 64 GB and M5 Ultra 96 GB.

CPU-core, RAM, storage, context and job-count suggestions are editorial starting configurations, not measured fit guarantees or shopping quotations. All six retain a pending-measurement U label. No creator video links, creator speed claims, full-precision promises, imported oMLX data, or fabricated TokFire measurements are published on the landing page. Model/runtime compatibility still needs validation on each recommended setup.

## Publication and earlier reports

The owner explicitly authorized publication of all 12 previously audited uploaded reports on 16 September 2026. Publication flags and consent timestamps were updated only for those 12 run IDs, with a private before-state audit on the server. Publication did not change measurements or integrity status. The owner subsequently requested deletion of the Legacy exact-token comparison dataset: all four local-ai-text-v1 reports and their dependent measurement rows were removed from the active database. The legacy comparison section was removed from the page. Minimal anti-replay receipts remain; other app profiles are preserved. Two new real M2 Max / MiniCPM5-2B runs were then uploaded publicly using server-issued challenges: a 1/2/3-job chat sweep (18 completed jobs) and a single-job tool workload (three failures, preserved as failures). Ten public reports remain: four workload reports and six earlier app reports. The private third-party reference dataset remains private. New users' public-sharing default remains off.

`/api/v2/leaderboard` serves current workload summaries. `/api/v2/archive` serves an explicit allowlist of summary fields for earlier app profiles, only for public, non-quarantined submissions. Trials remain labelled as trials. Earlier oMLX app measurements are distinct from third-party imported reference records. Legacy medians never receive an agent grade. No raw report, owner identifier, credential, or challenge nonce is returned by the archive.

## Checks

- TypeScript and targeted ESLint.
- 54 backend tests, including real earlier-report aggregation, schema/privacy rejection and workload grade boundaries.
- Desktop/mobile browser checks, three languages, image loading and horizontal overflow.
- Production locale, canonical, sitemap and public asset checks.
- Static mirror preserves the image and sends data operations to the live portal.
