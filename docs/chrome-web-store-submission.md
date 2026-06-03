# Chrome Web Store Submission Checklist

Reviewed against official Chrome Web Store guidance on 2026-06-03.

Official references:

- Chrome Web Store Program Policies: https://developer.chrome.com/docs/webstore/program-policies/policies
- User Data Policy FAQ: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- Manifest V3 additional requirements: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements/
- Troubleshooting Chrome Web Store violations: https://developer.chrome.com/docs/webstore/troubleshooting/
- Chrome permissions guidance: https://developer.chrome.com/docs/extensions/mv2/reference/permissions
- Single purpose FAQ: https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq

## Current Submission Posture

The extension has a defensible single purpose: inventory local browser sessions that may be exposed after suspected cookie theft, then help the user clean local browser state and review provider sessions.

The review-sensitive parts are the permissions and data categories:

- `cookies` plus broad `http://*/*` and `https://*/*` host permissions are sensitive because the extension can read cookie metadata across sites.
- `browsingData` is sensitive because it can delete local site data.
- `tabs` exposes web browsing activity metadata.
- The extension handles authentication information, browsing activity metadata, and finance/payment-related site indicators when those domains are present in the local browser profile.

## Privacy Policy Requirements

Publish a privacy policy before public submission. It should explicitly say:

- The extension does not read, store, render, transmit, sell, or share cookie values.
- The extension stores only redacted local scan snapshots in `chrome.storage.local`.
- Scan snapshots include domain/site keys, cookie counts, likely session-cookie names, open-tab counts, risk labels, provider category/action metadata, scan time, optional suspected compromise date, and reviewed-state flags.
- Data stays local to the browser profile unless the user separately provides it outside the extension.
- Local cleanup uses `chrome.browsingData.remove` and does not revoke provider-side sessions.
- There is no advertising, affiliate tracking, analytics, sale of user data, or third-party transfer.
- Any Limited Use statement should affirm that personal or sensitive user data is used only to provide or improve the extension's single purpose.

## Store Listing Requirements

The listing should be direct and narrow:

- Single purpose field: "Inventory local browser session indicators after suspected cookie theft and help users clear local browser state and review provider sessions."
- Prominently disclose that the extension inspects local cookie metadata and open-tab metadata.
- Prominently disclose that it does not collect cookie values and does not transmit scan data.
- Explain that broad host access is required so the Chrome cookies API can inventory cookie metadata across the browser profile.
- Explain that `browsingData` is required only for user-confirmed local cleanup.
- Explain that `tabs` is used only to count currently open HTTP/HTTPS sites that may recreate local state.
- Do not present the tool as proof that sessions were stolen; it is a local exposure inventory.

## Technical Review Checklist

Before packaging:

- Build from source with `npm run build` and submit the built `dist/` extension package.
- Re-check `dist/` for remote executable code references, dynamic remote script loading, `eval`, and dev-server URLs.
- Confirm all runtime code is bundled inside the extension.
- Confirm no network calls are made by the extension except user-clicked provider/login links.
- Confirm cookie values are absent from UI, storage snapshots, logs, tests, and generated artifacts.
- Confirm every cleanup action is user-initiated and confirmed.
- Confirm provider links open in a normal tab and do not embed provider pages or scrape provider content.
- Decide whether `incognito: "spanning"` is necessary for the first public release. Removing it may reduce review friction if incognito scanning is not a launch requirement.

## Permission Risk Notes

The current permissions are explainable for the product, but they are broad. Chrome Web Store policy requires the narrowest permission set needed for the user-facing feature.

Potential mitigations if review feedback complains about breadth:

- Move broad host access into optional host permissions requested when the user starts a scan.
- Add an in-app permissions explainer before the first scan.
- Offer a narrower mode that scans only high-value curated domains first, with all-site scanning as an explicit opt-in.
- Remove `tabs` if open-tab counts are not worth the review sensitivity.
- Remove `incognito` support for v1 unless the listing and UI clearly justify it.

