# Store Submission Notes

Prepared for release `v1.0.0`.

## Package

Build the Chromium package:

```bash
npm install
npm run build
cd dist
zip -qr ../store-packages/browser-session-dashboard-v1.0.0-chromium.zip .
```

Upload the ZIP with `manifest.json` at the ZIP root.

## Store Listing Copy

Name:

Browser Session Compromise Dashboard

Short description:

Local-only browser session triage after suspected cookie theft.

Full description:

Browser Session Compromise Dashboard is a local-only extension for Chrome, Brave, Microsoft Edge, and compatible Chromium browsers. It inventories redacted cookie/session indicators in the current browser profile, prioritizes high-value accounts, links to provider session/security pages where available, and lets users clear local browser cookies/site data for risky sites.

The extension is intended for incident response after suspected cookie theft. It does not prove that a cookie or session was stolen, does not revoke provider-side sessions, and does not send scan data to any server.

Key features:

- Scan the current browser profile for redacted cookie metadata.
- Group cookies and open HTTP/HTTPS tabs by site.
- Flag likely login/session cookies using explainable heuristics.
- Prioritize high-value providers across identity, email, finance, developer, messaging, gaming, productivity, commerce, cloud, entertainment, and social categories.
- Open provider session/security pages for common services.
- Optionally filter by suspected compromise date when cookie creation metadata is available.
- Clear local cookies/site data for individual sites.
- Bulk-clear high-severity sites with likely login sessions.
- Store redacted scan snapshots locally across dashboard reloads.

Privacy summary:

The extension does not read, display, store, export, hash, transmit, sell, or share cookie values. Scan data stays local in the browser profile. No analytics, advertising, telemetry, affiliate tracking, or third-party processors are used.

## Privacy Policy URL

Use:

https://github.com/skynet01/browser-session-dashboard/blob/main/PRIVACY.md

## Permission Justifications

`cookies`:

Required to inventory local cookie metadata and identify likely session indicators. Cookie values are dropped and never stored, rendered, logged, exported, transmitted, sold, or shared.

Broad `http://*/*` and `https://*/*` host permissions:

Required because the Chrome cookies API only exposes cookies for hosts the extension can access. Narrow host permissions would produce a misleading partial inventory.

`browsingData`:

Required for user-confirmed local cleanup of cookies and site storage. Cleanup only affects the current browser profile and does not revoke provider-side sessions.

`tabs`:

Required to count currently open HTTP/HTTPS sites that may recreate local browser state after cleanup. The extension does not read page content.

`storage`:

Required to store redacted local scan snapshots and reviewed-state flags across Manifest V3 service-worker restarts and dashboard reloads.

## Testing Notes For Reviewers

1. Install the extension package.
2. Open the dashboard from the extension icon.
3. Click Scan browser profile.
4. Confirm results show local sites, cookie counts, likely session counts, risk labels, reasons, and provider actions where available.
5. Confirm the UI states that local cleanup does not revoke stolen cookies.
6. Use a low-risk test site to verify Clear local data requires confirmation.
7. Confirm scan snapshots and UI do not contain cookie values.

## Store-Specific Notes

### Chrome Web Store

Official docs: https://developer.chrome.com/docs/webstore/publish

Chrome submission requires an interactive Chrome Web Store Developer Dashboard account. Fill out the Store Listing, Privacy, Distribution, and Test Instructions tabs, then submit for review.

### Brave

Official Brave Help says Brave supports nearly all Chromium-compatible extensions and installs them from the Chrome Web Store: https://support.brave.app/hc/en-us/articles/360017909112-How-can-I-add-extensions-to-Brave

There is no separate Brave extension store submission to complete for this extension. Publishing to the Chrome Web Store covers Brave users.

### Microsoft Edge Add-ons

Official docs: https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension

Edge submission requires Microsoft Partner Center. Upload the same Chromium ZIP, provide availability, properties, privacy information, store listing details, and certification testing notes.

### Safari App Store

Official docs: https://developer.apple.com/safari/extensions/

Safari distribution requires Apple Developer Program/App Store Connect. The extension must be converted to a Safari Web Extension package or app wrapper, tested in Safari, signed, and submitted through App Store Connect.

Safari support is experimental in this codebase. The scan dashboard and provider review flows can be packaged for Safari, but Safari does not support the Chromium `browsingData` API used for extension-driven local cleanup. The Safari UI disables cleanup controls through runtime capability detection.

Build Safari resources before conversion:

```bash
npm run build:safari-dist
```

Conversion command that builds without unsupported-key warnings:

```bash
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

Xcode build audit:

```bash
xcodebuild \
  -project 'store-packages/safari/browser-session-dashboard/browser-session-dashboard.xcodeproj' \
  -scheme 'browser-session-dashboard' \
  -configuration Debug \
  -destination 'platform=macOS' \
  build
```

Result: `BUILD SUCCEEDED`.

Launching the locally built wrapper app registered `com.skynet01.browser-session-dashboard.Extension(1.0)` with macOS. Enabling it in Safari Settings remains an interactive user permission step.

See `docs/safari-compatibility-audit.md` before attempting App Store submission.
