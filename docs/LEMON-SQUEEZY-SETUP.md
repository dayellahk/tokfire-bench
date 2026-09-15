# Lemon Squeezy Pro — seller setup

**TokFire Bench Pro — HK$180, one-time purchase.**
Free: 1–3 simultaneous jobs. Pro: 4–20 jobs calling **the same local model**.
Both llama.cpp/GGUF and oMLX/MLX are supported.

## Ready-to-use product description

Measure how your Mac handles simultaneous AI requests. TokFire Bench Pro
unlocks 4–20 benchmark jobs on one local model. See each job’s token speed,
time to first token, total throughput and a saved assessment report. Choose
from 20 interface languages. Pay once; no subscription.

Requires Apple Silicon macOS 13+, Python 3.10+, a compatible llama.cpp or oMLX
installation, and separately downloaded model weights. Pro activation and each
Pro test require internet access. More jobs need more memory; no particular
speed or capacity is guaranteed. This developer build is ad-hoc signed, not
Apple notarized. The benchmark website currently has restricted access; local
testing and local reports work independently.

## Configure the product

1. In Lemon Squeezy, create a digital product with a **one-time HKD 180**
   price, enable license keys, and set license length to unlimited/perpetual.
   Set the activation limit to **1 device**. Concurrent job count is separate
   from device count. Deactivate the current Mac before activating another.
2. Test the checkout and license in Lemon Squeezy **test mode**, using a
   separate test build configured with that test product/variant. Test mode
   is not a live sale. Copy the reviewed product to Live mode only after the
   store is approved for live sales.
3. Copy the **live** store ID, product ID, variant ID and checkout URL into:
   `native/Sources/LocalAIBench/Resources/lemon-squeezy.json`.
   These are public identifiers. Never embed a seller API key in the app.
4. Rebuild the DMG with those identifiers and upload it with the installation
   instructions. Verify the purchase → activation → 4–20 jobs → deactivate
   flow with a legitimate live license before declaring live payments ready.
   Do not charge a real card merely for testing without authorization.
5. For refunds or revoked access, disable the corresponding license in the
   seller dashboard. The app validates license status on each Pro run; the
   public License API does not expose payment/refund details for an independent
   refund check. Automating payment-state revocation would require a separate
   authenticated seller-side webhook service.

## App flow

The app pre-validates the entered key against the exact configured store,
product and variant before calling `/v1/licenses/activate`. Activation uses an
anonymous `LocalAI-<UUID>` instance name, without device serial or hostname.
The key and returned instance ID are stored together in macOS Keychain.
On startup and before each Pro test, `/v1/licenses/validate` verifies that exact
instance. It must be active, belong to the configured product and be perpetual
(`expires_at=null`). Invalid, expired, disabled, wrong-product and wrong-instance
responses never unlock Pro. Free 1–3 jobs do not require a licensing connection.

Deactivate calls `/v1/licenses/deactivate` and removes the local Keychain entry
only after the server confirms success. No automatic activation retries are
performed: a timed-out activation may have succeeded remotely. If an activation
response is lost, the seller can release the orphaned instance in the dashboard.
The runner receives credentials via stdin, never command-line arguments or
benchmark reports. No buyer name/email is retained from API responses.

This is normal license enforcement, not tamper-proof DRM. Distributed source
can be modified; the app does not claim to prevent deliberate patching.

## Official references

- https://docs.lemonsqueezy.com/api/license-api
- https://docs.lemonsqueezy.com/api/license-api/activate-license-key
- https://docs.lemonsqueezy.com/api/license-api/validate-license-key
- https://docs.lemonsqueezy.com/api/license-api/deactivate-license-key
- https://docs.lemonsqueezy.com/help/getting-started/test-mode

## Current external setup — 2026-09-16

Dayella Limited retains HKD. **TokFire Bench Pro** is published in **test mode**:

- Store ID: `475421`; test product ID: `1363847`; test variant ID: `2130106`.
- Product: https://app.lemonsqueezy.com/products/1363847
- Test checkout: https://dayella.lemonsqueezy.com/checkout/buy/2468b474-0d2a-4893-a440-79f815160692
- Single payment HK$180, Software tax category, generated license keys,
  perpetual length, activation limit 1. Existing demo product unchanged.
- Official test-card checkout succeeded; no real card was charged.
- Real test License API: first activation and validation passed; second device
  rejected at the activation limit; deactivated instance rejected; transfer
  activation passed. All QA instances were released afterward.
- Checkout displayed HK$180.00, but test order #4754211 showed HK$180.03 in its
  order subtotal/total. Resolve this test receipt discrepancy with Lemon Squeezy
  before accepting live payments; exact live charged amount is not verified.

The merchant dashboard still requires business details to activate live sales.
The release app keeps zero IDs and disables purchases/activation until a live
product exists. Never ship the test IDs as a paid production configuration.
After store approval, copy the product to live mode, obtain its new IDs, rebuild,
and replace the downloadable DMG before opening sales. The public test listing
and test license do not constitute a working live paid release.
