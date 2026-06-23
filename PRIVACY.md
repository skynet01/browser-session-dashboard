# Privacy Policy

Effective date: 2026-06-11

Browser Session Auditor is a local-only browser extension for triaging local browser session indicators after suspected cookie theft.

## Data The Extension Handles

The extension can inspect local browser-profile metadata needed to build the dashboard:

- Site/domain names associated with local cookies.
- Cookie names and cookie metadata such as path, flags, SameSite status, session/persistent status, store ID, partition marker, and expiration metadata when available.
- Open HTTP/HTTPS tab URLs and titles for risk-scoring context.
- Local cleanup action status.
- Redacted scan timestamps, optional suspected compromise date, risk labels, reasons, provider categories, provider action links, review timestamps, and metadata-only session-cookie fingerprints (cookie name, domain, path, store ID, and expiration - never cookie values).

## Cookie Values

The extension does not read, display, store, export, hash, transmit, sell, or share cookie values. Cookie values are dropped immediately by the extension's Chrome API adapter and are not part of stored scan snapshots.

## Local Storage

The extension stores redacted scan snapshots and per-site review records (review timestamp plus metadata-only session-cookie fingerprints) in `chrome.storage.local` so the dashboard can remember the latest scan and reviewed state across reloads and rescans.

Stored snapshots do not include cookie values.

## Network And Third Parties

The extension does not send scan data to any server. It does not use analytics, advertising, affiliate tracking, telemetry, or third-party data processors.

Provider review links are normal user-clicked links that open the provider's own login, security, session, or device-management page in a browser tab.

## Local Cleanup

The extension can clear local browser cookies and site data only when the user initiates and confirms cleanup. Local cleanup logs out this browser profile, but it does not revoke already stolen cookies or provider-side sessions.

## Data Sharing And Sale

The extension does not sell, transfer, or share user data.

## Permissions

The extension requests:

- `cookies` and broad HTTP/HTTPS host access so it can inventory cookie metadata across the current browser profile.
- `browsingData` so it can clear local cookies and site storage after user confirmation.
- `tabs` so it can count currently open HTTP/HTTPS sites that may recreate local browser state.
- `storage` so it can keep redacted local scan snapshots and reviewed-state flags.

## Contact

Open an issue at https://github.com/skynet01/browser-session-dashboard/issues for privacy or security questions.
