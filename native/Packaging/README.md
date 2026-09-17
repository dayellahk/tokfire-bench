# macOS installation image and signing

`bash native/build-dmg.sh` builds a developer preview with a branded Finder window,
an Applications shortcut, fixed icon positions and English/Traditional Chinese
installation instructions. Building the layout requires a logged-in macOS desktop
and permission for the build shell to automate Finder. It fails if layout creation
fails; it does not silently ship an unconfigured image.

## Public signed release

Apple Developer Program membership and a valid **Developer ID Application**
certificate with its private key in the signing Mac's Keychain are required.
An Apple Development certificate or ad-hoc signature cannot replace this.

1. Enroll with Apple, create/import the Developer ID Application certificate,
   and verify it appears in `security find-identity -v -p codesigning`.
2. Use `xcrun notarytool store-credentials TokFireNotary` to save the Apple
   notarization credentials in Keychain. Enter secrets interactively; never
   commit credentials or place passwords in scripts.
3. Build:

```sh
TOKFIRE_RELEASE=1 \
TOKFIRE_SIGN_IDENTITY='Developer ID Application: YOUR LEGAL NAME (TEAMID)' \
TOKFIRE_NOTARY_PROFILE='TokFireNotary' \
bash native/build-dmg.sh
```

Release mode signs the app with hardened runtime and a secure timestamp,
submits the app to Apple, staples and validates its ticket, then creates the
Finder disk image. It signs and notarizes the final DMG too, staples its ticket,
and checks Gatekeeper acceptance before producing the checksum.

Missing configuration or failed notarization stops the build. Publish only after
successful completion and testing a browser-downloaded copy on a separate Mac.
The preview path is explicitly unnotarized and may still trigger Gatekeeper.
Do not disable Gatekeeper or strip quarantine as an installation fix.

The existing bundle identifier is retained to preserve upgrade compatibility.
No signing credentials or certificates are included in source/downloads.

Official references:
- https://developer.apple.com/developer-id/
- https://developer.apple.com/documentation/security/customizing-the-notarization-workflow
- https://developer.apple.com/support/compare-memberships/
