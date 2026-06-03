# Safari Compatibility Audit

Audit date: 2026-06-03

## Result

Safari support is feasible for the scan dashboard, saved scan state, provider review links, and reviewed/done state.

Safari does not currently support the extension-driven local cleanup feature used by the Chromium build because the Chromium implementation depends on `chrome.browsingData`. The Safari build must disable local cleanup controls and instruct users to revoke provider sessions and clear website data from Safari settings.

## What Was Checked

- Official Apple Safari extension documentation:
  - https://developer.apple.com/safari/extensions/
  - https://developer.apple.com/documentation/safariservices/safari-web-extensions
  - https://developer.apple.com/documentation/safariservices/optimizing-your-web-extension-for-safari
- Local Apple tooling:
  - `xcrun safari-web-extension-converter`
  - `xcodebuild`
  - `pluginkit`
- Extension source usage:
  - `chrome.cookies`
  - `chrome.storage`
  - `chrome.tabs`
  - `chrome.browsingData`
  - Manifest V3 service worker

## Findings

### Manifest

The raw Chromium manifest is not Safari-ready. Apple conversion warned about unsupported keys:

- `browsingData`
- `background.type`
- `incognito`

Added `npm run build:safari-dist`, which builds the extension, copies `dist/` to `store-packages/safari-extension`, and patches `manifest.json` for Safari:

- Removes `browsingData` from `permissions`.
- Removes `incognito`.
- Removes `background.type`.

The patched Safari manifest converted without unsupported-key warnings.

### Local Cleanup

Chromium local cleanup uses `chrome.browsingData.remove()`. Safari does not expose that API in the converted WebExtension target.

Implemented runtime capability detection:

- Background route: `getCapabilities`.
- Capability: `localCleanup`.
- Dashboard disables row cleanup and bulk cleanup when local cleanup is unsupported.
- Dashboard copy tells Safari users to review provider sessions and clear website data from browser settings.
- Cleanup route returns a clear unsupported-browser error if called without `browsingData`.

### Xcode Conversion And Build

The first generated Xcode project failed because the generated app bundle ID and extension bundle ID did not satisfy Apple's parent/child prefix rule.

Successful conversion used:

```bash
npm run build:safari-dist
rm -rf store-packages/safari
xcrun safari-web-extension-converter store-packages/safari-extension \
  --project-location store-packages/safari \
  --app-name browser-session-dashboard \
  --bundle-identifier com.skynet01.browser-session-dashboard \
  --macos-only \
  --copy-resources \
  --no-open \
  --no-prompt \
  --force
```

Successful build used:

```bash
xcodebuild \
  -project 'store-packages/safari/browser-session-dashboard/browser-session-dashboard.xcodeproj' \
  -scheme 'browser-session-dashboard' \
  -configuration Debug \
  -destination 'platform=macOS' \
  build
```

Result: `BUILD SUCCEEDED`.

### Registration

Launching the locally built wrapper app registered this Safari extension bundle:

```text
com.skynet01.browser-session-dashboard.Extension(1.0)
```

This confirms macOS recognizes the converted Safari Web Extension. Enabling it in Safari Settings is still an interactive user permission step.

## Remaining Safari Work Before App Store Submission

- Run manual Safari QA after enabling the extension in Safari Settings.
- Grant website access for all websites before scan QA. In Safari, enabling the extension is not enough; host permissions are separately granted from the extension toolbar item or Safari Settings > Extensions.
- Verify `chrome.cookies.getAll`, URL-scoped `chrome.cookies.getAll({ url })`, `chrome.tabs.query`, and `chrome.storage.local` behavior in Safari with real profile data after all-site website access is granted.
- Current Safari cookie fallback is provider-domain scoped if broad enumeration is empty. Chrome, Brave, and Edge continue to use broad actual-cookie inventory first.
- Verify provider links open correctly.
- Verify cleanup controls are disabled and the unsupported-cleanup copy appears.
- Decide whether to implement native Safari website-data cleanup through the containing app. That would require new native code and a separate privacy/security review.
- Sign with an Apple Developer Program team and submit through App Store Connect.

## Current Compatibility Claim

Recommended wording:

Safari support is experimental and currently supports local session inventory and provider review links. Safari does not support extension-driven local cleanup in this build.
