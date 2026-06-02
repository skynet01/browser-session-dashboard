# Browser Compatibility

## Target Support

- Google Chrome desktop: supported target.
- Microsoft Edge desktop: supported target.
- Brave desktop: supported target.
- Firefox, Safari, mobile browsers, and non-Chromium extension platforms are out of scope for v1.

## Required APIs

- `chrome.cookies`: inventory cookie metadata and support selected local cookie removal. Requires `cookies` permission and matching host permissions.
- `chrome.browsingData`: clear local cookies and site storage during cleanup.
- `chrome.tabs`: read open-tab context and open provider security/session-management links.
- `chrome.runtime`: handle extension lifecycle and service worker/dashboard messaging.
- `chrome.storage`: persist redacted scan snapshots and action state across Manifest V3 service worker restarts.

Avoid browser-specific convenience APIs unless Chrome, Edge, and Brave are manually verified.

## Install and QA Matrix

| Browser | Unpacked Extension Page | Required Manual QA |
| --- | --- | --- |
| Chrome desktop | `chrome://extensions` | Load `dist/`, scan, cleanup confirmation, export, storage snapshot redaction, console redaction. |
| Edge desktop | `edge://extensions` | Repeat Chrome checks and verify policy/API errors are surfaced clearly. |
| Brave desktop | `brave://extensions` | Repeat Chrome checks with Brave Shields enabled and disabled on a low-risk test site. |

## Chrome Desktop

- Primary development baseline for Manifest V3 behavior.
- Verify permission prompts include cookies, browsing data, tabs, storage, and broad site access.
- Verify service worker console output does not log raw cookie objects or values.

## Microsoft Edge Desktop

- Edge supports Chromium extension APIs, but enterprise policy can restrict extension installation, host permissions, and API access.
- Manual QA must record any policy-controlled failures.
- If policy or API restrictions apply, the dashboard must show an error or limited-coverage state rather than a successful empty scan.

## Brave Desktop

- Brave supports most Chromium-compatible extensions, but privacy features can change site behavior before and after cleanup.
- Brave Shields may affect whether test sites recreate cookies or storage after cleanup.
- Manual QA must run relevant scan and cleanup checks with Shields enabled and disabled for a low-risk test site.

## Known Compatibility Limits

- Broad cookie inventory depends on broad `http://*/*` and `https://*/*` host permissions in every target browser.
- Incognito/private browsing uses separate stores and may require explicit extension access. Do not treat normal-profile scans as incognito coverage.
- Partitioned-cookie support is limited unless the implementation explicitly handles partition keys and context.
- Browser profiles are isolated. Each profile requires its own install and scan.
- Provider security-page URLs can change independently of browser compatibility and must be verified during manual QA.
