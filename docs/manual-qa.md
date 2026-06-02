# Manual QA

Use this checklist for each release build of the unpacked extension. Build first with `npm run build`, then load the generated `dist/` folder.

## Test Data

- Use a non-sensitive browser profile or test profile.
- Sign in to one or more low-risk test sites so the profile has cookies and site storage.
- Create or identify one unique test cookie value for redaction checks. Never use a production secret as the test value.
- Keep DevTools open during scan, cleanup, and export checks.

## Chrome Desktop

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Select Load unpacked.
4. Choose the project `dist/` directory.
5. Confirm the extension loads without manifest or service worker errors.
6. Confirm the permissions prompt and extension details show expected cookie, browsing data, tabs, storage, and broad HTTP/HTTPS site access.
7. Click the extension icon and confirm the dashboard opens.
8. Run Scan browser profile.
9. Confirm scanned sites are grouped by site/domain and show risk, reasons, cookie counts, likely session-cookie counts, and open-tab context where available.
10. Confirm the dashboard states that inventory is a likely local exposure indicator, not proof that sessions were stolen.
11. Confirm every cleanup control warns that local cleanup logs out this browser but does not revoke an already stolen cookie.
12. Open a known provider action link and confirm it opens the expected provider security/session-management page.

## Microsoft Edge Desktop

1. Open `edge://extensions`.
2. Enable Developer mode.
3. Select Load unpacked.
4. Choose the project `dist/` directory.
5. Confirm the extension loads without manifest or service worker errors.
6. Repeat the Chrome scan, provider-link, cleanup, export, storage, console, and redaction checks.
7. If Edge enterprise policy blocks loading, host permissions, `chrome.cookies`, `chrome.browsingData`, `chrome.tabs`, or `chrome.storage`, record the policy name or visible error and confirm the UI does not silently show an empty clean state.

## Brave Desktop

1. Open `brave://extensions`.
2. Enable Developer mode.
3. Select Load unpacked.
4. Choose the project `dist/` directory.
5. Confirm the extension loads without manifest or service worker errors.
6. Repeat the Chrome scan, provider-link, cleanup, export, storage, console, and redaction checks.
7. Run the scan and cleanup checks with Brave Shields enabled on a low-risk test site.
8. Run the same checks with Brave Shields disabled for that site.
9. Record any difference in site behavior or cookie recreation after cleanup.

## Scan Flow

1. Open the dashboard from the extension icon.
2. Start a scan.
3. Confirm pending/loading state is visible while scan work is active.
4. Confirm scan completion shows a timestamp or clear completion state.
5. Confirm the result list is sorted by highest risk first.
6. Confirm filters or search, if present, do not change counts incorrectly.
7. Confirm API errors are visible and actionable instead of rendering as a successful empty inventory.

## Cleanup Confirmation

1. Select a low-risk test site from the scan results.
2. Start local cleanup.
3. Confirm a destructive-action confirmation appears before data is cleared.
4. Confirm the confirmation copy says local cleanup logs out this browser/profile only.
5. Confirm the confirmation copy says local cleanup does not revoke a cookie already stolen by an attacker.
6. Confirm the UI shows cleanup pending state while `chrome.browsingData` work is active.
7. Confirm cleanup success or failure is logged in the dashboard action history without cookie values.
8. Rescan and confirm the test site's local cookies/storage are removed or reduced as expected.
9. Confirm any open tab that recreates cookies after cleanup is called out or reproducible in notes.

## Export Verification

1. Generate the response checklist export after a scan.
2. Confirm the export includes site/domain, risk, reasons, recommended action, provider link when available, and cleanup status when available.
3. Confirm the export repeats the boundary that local cleanup does not revoke already stolen cookies.
4. Confirm the export is redacted and contains no cookie values.
5. If privacy-minimal export mode exists, confirm it also omits cookie names.

## Cookie Value Redaction

Run these checks in Chrome, Edge, and Brave:

1. UI: search all visible dashboard text for the unique test cookie value. It must not appear.
2. UI: inspect expanded rows, modals, warnings, action logs, errors, and empty states. Cookie values must not appear.
3. Storage snapshots: inspect `chrome.storage.local` data from the extension page or DevTools. Cookie values must not appear.
4. Storage snapshots: confirm stored scan data only includes redacted metadata such as domain, name, flags, counts, risk, reasons, store ID, and partition marker.
5. Exported checklists: search the exported file for the unique test cookie value. It must not appear.
6. Console output: search dashboard and service worker console output for the unique test cookie value. It must not appear.
7. Console output: confirm errors and debug logs do not dump raw `chrome.cookies` objects, because those objects include `value`.
8. Failure criterion: any cookie value found in UI, storage, export, or console output blocks release.
