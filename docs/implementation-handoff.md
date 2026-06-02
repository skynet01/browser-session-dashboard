# Browser Session Compromise Dashboard Handoff

## Start Here

Primary plan:

- `docs/superpowers/plans/2026-06-02-browser-session-compromise-dashboard.md`

This is a from-scratch Chromium Manifest V3 extension project. The target browsers are:

- Google Chrome desktop
- Microsoft Edge desktop
- Brave desktop

The extension's job is to help a user respond after suspected cookie theft. It inventories local browser cookies/site data as likely exposure indicators, groups them by site, assigns severity, and gives the user clear next actions.

## Required Skills For New Session

Use these skills in this order:

1. `superpowers:executing-plans` or `superpowers:subagent-driven-development`
   - Use this to execute the saved implementation plan task-by-task.

2. `compound-engineering:ce-frontend-design`
   - Required before implementing the dashboard UI.
   - Treat the UI as a greenfield security-response dashboard.
   - The dashboard should be dense, calm, and action-oriented rather than a marketing page.

3. `superpowers:verification-before-completion`
   - Use before claiming the implementation is complete.

## Core UX Requirement

When the user clicks the extension icon, the extension must open a dashboard showing a list of likely compromised sites.

Each listed site should show:

- Site/domain name, grouped by registrable site where possible
- Severity, such as `critical`, `high`, `medium`, or `low`
- Why it was flagged, for example likely session cookies, open tabs, known provider action available
- Cookie count and likely session-cookie count
- A clear action to open the provider's security/session-management page when known
- A clear local-cleanup action for cookies/storage
- A warning that local cleanup does not revoke already stolen cookies

Do not show cookie values. Do not store cookie values. Do not log cookie values.

## Product Claim Boundary

The extension must not claim it knows exactly which sessions were stolen. The correct wording is:

- These are the browser sessions/sites currently present and likely exposed if this browser profile's cookies were stolen.

It must also clearly explain:

- Clearing local browser data logs out this browser.
- Clearing local browser data does not invalidate an attacker's already stolen cookie.
- The user still needs to revoke sessions from provider security pages where possible.

## Architecture Summary

Use one Chromium MV3 codebase with these main pieces:

- `public/manifest.json` for MV3 permissions and extension metadata
- `src/background/serviceWorker.ts` for extension icon click and message routing
- `src/background/chromeCookies.ts` for redacted cookie inventory
- `src/background/chromeTabs.ts` for open-tab context
- `src/background/chromeCleanup.ts` for local cleanup via `chrome.browsingData`
- `src/core/*` for pure domain grouping, session classification, risk scoring, and checklist export
- `src/ui/*` plus `dashboard.html` for the dashboard
- `docs/manual-qa.md`, `docs/security-model.md`, and `docs/browser-compatibility.md` created during implementation

## Browser Compatibility Requirements

Manual QA must be completed in:

- `chrome://extensions`
- `edge://extensions`
- `brave://extensions`

The implementation should use extension APIs supported across target Chromium browsers:

- `chrome.cookies`
- `chrome.browsingData`
- `chrome.tabs`
- `chrome.runtime`
- `chrome.storage`

Avoid Chrome-only convenience APIs unless the plan is updated and Edge/Brave are manually verified.

## UI Design Direction

Use `compound-engineering:ce-frontend-design` before building the dashboard.

Recommended UI shape:

- Single dashboard opened from the extension icon
- Top summary strip with total sites, critical count, high count, and scan time
- Primary list/table of sites sorted by severity
- Severity color coding with restrained, accessible colors
- Filters for severity and search by domain
- Action buttons per site:
  - Open security page
  - Clear local data
  - Mark reviewed
- Destructive local cleanup requires confirmation
- Persistent warning near cleanup controls: "Local cleanup does not revoke stolen cookies."

The design should feel like a security operations tool: compact, scannable, and direct.

## Verification Expectations

At minimum:

- `npm test`
- `npm run typecheck`
- `npm run build`
- Manual unpacked-extension QA in Chrome, Edge, and Brave
- Visual verification of the dashboard after frontend work

Security-specific checks:

- Cookie values never appear in UI text
- Cookie values never appear in storage snapshots
- Cookie values never appear in exported checklists
- Cookie values are not logged in console output

## Current Workspace State

As of this handoff, the workspace contains planning docs only. No extension code has been implemented yet.
