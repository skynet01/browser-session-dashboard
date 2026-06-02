# Security Model

## Product Claims

- The dashboard inventories local browser cookies and site data as likely exposure indicators after suspected cookie theft.
- It does not prove that a specific session, account, or cookie was stolen.
- The correct claim is: these are browser sessions/sites currently present and likely exposed if this browser profile's cookies were stolen.
- Risk scoring is heuristic. It prioritizes response work; it is not forensic attribution.

## Cleanup Boundary

- Local cleanup clears cookies and site data from this browser profile.
- Local cleanup can log out this browser.
- Local cleanup does not revoke an attacker's already stolen cookie.
- Users still need provider-side session revocation, password rotation, MFA review, and account-security checks where available.
- Sites open in tabs can recreate cookies after cleanup, so rescan after cleanup.

## Data Handling

- No network egress is required or allowed for scan, scoring, storage, cleanup, or export.
- Cookie values must be discarded immediately if returned by `chrome.cookies`.
- Cookie values must never be stored, rendered, logged, exported, hashed, or sent.
- Stored snapshots may include only redacted metadata: domain, cookie name, path, flags, session/persistent status, SameSite, store ID, partition marker, counts, risk, reasons, action status, and timestamps.
- Exports must be redacted checklists. They may include domains, risk, reasons, provider action links, and cleanup status.
- Console logging must never print raw cookie objects because raw `chrome.cookies` results include `value`.

## Permissions

- The extension needs `chrome.cookies` to inventory local cookies and remove selected cookies.
- The extension needs `chrome.browsingData` to clear local cookies and site storage for cleanup.
- The extension needs `chrome.tabs` to add open-tab context to risk scoring and to open provider security pages.
- The extension needs `chrome.runtime` for extension page and service worker messaging.
- The extension needs `chrome.storage` for redacted scan snapshots and action state across Manifest V3 service worker restarts.
- Broad `http://*/*` and `https://*/*` host permissions are required because `chrome.cookies.getAll()` only returns cookies for hosts the extension can access. A narrow host list would create a misleading partial inventory.
- Broad host permissions increase sensitivity; the mitigation is local-only operation, no network egress, and strict cookie-value redaction.

## Browser and Profile Limits

- The dashboard reports the browser profile where the extension is installed and permitted.
- Incognito has separate cookie stores. Incognito coverage depends on browser settings, extension incognito access, and the current implementation's handling of incognito `storeId`s.
- Normal-profile results must not be described as complete incognito coverage.
- Different browser profiles are separate inventories. Install and run the extension in each profile that needs review.
- Enterprise policies, especially in Edge, can block extension loading, host permissions, or extension APIs. API failures must be surfaced to the user.

## Cookie Model Limits

- Partitioned cookies may be underreported unless the implementation explicitly handles partition keys and relevant frame context.
- Domain cookies, host-only cookies, subdomain cookies, and origin-scoped storage do not map perfectly to one cleanup target.
- Some sites authenticate with IndexedDB, localStorage, service workers, or multi-cookie combinations that may not look like a classic session cookie.
- Cookie names are only signals. Names such as `session`, `sid`, `auth`, `token`, `jwt`, `remember`, and `refresh` can indicate session risk, but context matters.
- CSRF cookies alone are usually not login sessions.
- `HttpOnly` cookies are visible to the extension API as metadata, but their values must remain inaccessible to the UI and exports.

## Release Blockers

- Any cookie value in UI text, storage snapshots, exported checklists, or console output.
- Any claim that the extension proves which sessions were stolen.
- Any claim that local cleanup revokes already stolen remote cookies.
- Any scan failure that is rendered as a clean empty inventory without an error.
- Any network request introduced for scan, scoring, cleanup, storage, or export without an explicit security review.
