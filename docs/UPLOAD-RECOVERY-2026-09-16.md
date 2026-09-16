# Upload recovery — 16 September 2026

## Diagnosis

The production database had no user accounts and no submissions. The Mac had 12
saved reports, with 6 pending envelopes. The recent GUI validation runs explicitly
disabled upload; production API smoke-test accounts and their reports were removed
after testing. Public sharing was false on the pending envelopes.

Two implementation issues compounded the missing sign-in:

1. `--no-upload` assigned the persisted `enabled` setting from the view, leaving
   automatic upload disabled on later ordinary launches. Upload suppression is now
   a launch-only setting, evaluated before the store can enqueue or retry. It does
   not change the saved preference. The test flag cannot be bypassed by a UI toggle.
2. The legacy report validator's existing one-token tolerance used an exact numeric
   boundary. Real runtime rate × duration products sometimes differed by
   `1.0000000000000142` tokens and were rejected. The boundary now includes a
   `1e-9` token floating-point allowance. It still rejects material differences;
   measurements and report JSON are not rewritten.

## Recovery actions

Restored this Mac's automatic-upload preference to the user's requested enabled
default. Validated all 12 local reports with the corrected upload schema. Preserved
the original 6 queue envelopes and added the 6 missing reports as private pending
uploads. No report was published, no fake measurements were introduced, and no
account was manufactured. Account creation/sign-in is required to complete upload.

The website's My data view lists stored reports for the signed-in owner. The public
rankings view requires explicit publication and shows workload and legacy standard
profiles separately; trial and older jobs/oMLX profiles remain stored reports, not
new 0.7 workload measurements.

## Verification

38 backend tests pass, including rejection beyond the rounding boundary. TypeScript
passes. A focused Swift regression test verifies launch-only suppression, unchanged
saved preferences and refusal to queue while suppression is active. Mac build 9
retains app version 0.7.0 and contains the upload-setting fix.

## Follow-up: guest uploads

The login requirement above was superseded by guest uploads at the user's request.
All 12 reports are now stored privately under the Ego guest session and the outbox
is empty. See GUEST-UPLOADS.md for the current flow and validation.
