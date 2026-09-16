# Cloudflare static mirror

Project: `tokfire-bench`, account `162a5d58acddc4d87c0fd46565bc67d4`.
URL: https://tokfire-bench.pages.dev
Primary application: https://tokfires.com (Linode + MySQL).

`node deploy/build-static.mjs` exports the live English, Traditional Chinese and Simplified Chinese home and methodology pages into `dist/cloudflare-static`. It copies their public CSS/favicon, removes Next.js hydration scripts and account/upload forms, and converts comparison/account actions to explicit main-portal links. The static site is visibly labelled. No credentials, private reports, database copy or user session are exported.

Reference-library and sign-in URLs redirect to the matching language on the live portal. Installers download from the primary site. Canonical URLs, language alternates and the copied sitemap point to the primary site to keep its search identity.

After deploying and checking the primary site:

```sh
node deploy/check-locales.mjs
node deploy/build-static.mjs
pnpm exec wrangler pages deploy dist/cloudflare-static --project-name tokfire-bench --branch main
```

Wrangler needs an authorized Cloudflare login or appropriately scoped API token supplied outside Git. This is a Direct Upload Pages project; syncing is an explicit deployment step, not an automatic Git integration. Main-domain DNS and the Linode database are unchanged.

Cloudflare reference: https://developers.cloudflare.com/pages/get-started/direct-upload/
