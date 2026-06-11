# Post-Review Session Tracking — Design

Date: 2026-06-11
Status: Approved

## Problem

Marking a site as reviewed ("Mark done", shown green) only edits `reviewedSiteKeys` on the latest scan snapshot. The next scan calls `saveScanSnapshot` without carrying that list over, so all review marks are wiped. Worse, after the user remediates a site (revokes sessions, logs back in), the next scan flags the brand-new session as critical/high exposure — even though a session created after remediation was never part of the stolen cookie data.

Separately, the suspected-compromise-date cookie filter is dead code: Chrome's `chrome.cookies` API exposes no creation date and `redactCookie` never populates `creationDate`, so `filterCookiesBySuspectedDate` never filters anything while the UI claims it does.

## Goals

1. Review marks persist across scans permanently until the user unmarks them.
2. When a reviewed site shows a session that changed since the review, the dashboard clearly labels it as a new session created after the review — not affected by the original theft.
3. Stay within the published privacy policy: no reading, storing, or hashing of cookie values. All detection is metadata-only.
4. Repurpose the suspected-compromise-date as incident context; remove the non-functional filtering and its misleading copy.

## Non-Goals

- Proving cryptographically that a cookie is new (impossible without values; the policy forbids hashing them).
- Deduplicating the runtime message types shared by `dashboard.ts` and `serviceWorker.ts` (reported, out of scope).
- Any provider-side or network functionality. The extension stays local-only.

## Design

### 1. Review store (`src/storage/reviewStore.ts`)

A new `chrome.storage.local` key `siteReviews` holding:

```ts
type SiteReview = {
  reviewedAt: string;                    // ISO timestamp of the user's mark
  sessionCookieFingerprints?: string[];  // baseline at review time; absent = unknown
};
type SiteReviews = Record<string /* siteKey */, SiteReview>;
```

Operations: `getSiteReviews`, `setSiteReview(siteKey, review)`, `removeSiteReview(siteKey)`. Reviews are independent of scan snapshots; scans never modify them.

Migration: when reading, if `siteReviews` is absent and the latest snapshot has legacy `reviewedSiteKeys`, seed one record per key with `reviewedAt = snapshot.scannedAt` and no fingerprint baseline, then persist. An unknown baseline can never produce a "new session" claim (see §3).

### 2. Session-cookie fingerprints

`SiteInventory` gains `likelySessionCookieFingerprints?: string[]` (omitted when empty), computed in `inventoryBuilder.ts` for the cookies already classified as likely sessions:

```
fingerprint = name | domain | path | storeId | (session ? "session" : floor(expirationDate))
```

Metadata only — consistent with PRIVACY.md ("does not read, display, store, export, hash ... cookie values"). When the user marks a site done, the site's current fingerprints become the review baseline.

### 3. Review status derivation (`src/core/reviewStatus.ts`)

Pure function: `deriveReviewStatus(site, review) → { reviewedAt, newSession, residualSession } | undefined`.

- No review record → `undefined`.
- No current session fingerprints → `{ newSession: false, residualSession: false }` (plain "Reviewed").
- Unknown baseline (migrated record) → both `false` (plain "Reviewed"; never claim newness without a baseline).
- Otherwise: `newSession` = any current fingerprint not in the baseline; `residualSession` = any current fingerprint in the baseline. Both can be true.

Honesty rule: fingerprint change is *consistent with* a fresh login but can also be caused by a site refreshing cookie expiry. Safety is therefore asserted from the user's review action ("if you revoked sessions when you reviewed, this session postdates the theft"), never from fingerprints alone. Fingerprint matches warn ("same cookies as at review"); non-matches inform ("changed since your review") — neither direction overclaims.

### 4. Runtime messages (`serviceWorker.ts`)

- `markReviewed` now writes a `SiteReview` (timestamp = now, baseline = the site's fingerprints from the latest snapshot) to the review store.
- New `unmarkReviewed` message deletes the record.
- `scan`, `getLatestSnapshot`, `markReviewed`, `unmarkReviewed` responses include the current `reviews: SiteReviews` map alongside the snapshot.
- `scan` no longer passes a date filter to `buildInventory`; the suspected date is stored on the snapshot purely as context.
- `ScanSnapshot.reviewedSiteKeys` remains in the stored shape for backward compatibility of old snapshots but is no longer written to or read by the UI after migration.

### 5. Dashboard UI (`dashboard.ts`, `dashboard.css`)

State gains `reviews`. Per-site rendering by derived status:

- **New session** (`newSession: true`): green row treatment, pill "New session", explanatory line: "Session cookies changed since your review on <date> — if you revoked sessions then, this session was created after the theft and is not affected." If `residualSession` is also true, append "Some cookies from before the review are still present."
- **Reviewed, unchanged** (`residualSession: true`, `newSession: false`): pill "Reviewed <date>", line "Same session cookies as at review time."
- **Reviewed, no sessions**: pill "Reviewed <date>".

Behavioral changes:

- Reviewed sites (any status) are excluded from `highSeveritySessionSites` (bulk cleanup) and from the Critical/High summary tiles; a "Reviewed" tile is added.
- "Mark done" toggles: reviewed rows show "Unmark" which sends `unmarkReviewed`.
- Clearing a site's local data keeps its review record (so the post-cleanup re-login is labeled a new session) and persists the updated snapshot to storage instead of only mutating in-memory state.
- The compromise-date context strip copy changes to: the date is incident context; Chrome does not expose cookie creation dates, so cookies cannot be filtered by date.
- Search-input focus and caret position are preserved across re-renders (capture active `data-control` element before `innerHTML` replacement, restore after).

### 6. Docs

- README: replace the "Cookies with known creation dates after that date are filtered out" bullet with the context-label behavior; add a bullet describing persistent reviews and new-session labeling.
- PRIVACY.md: extend the stored-data list with review timestamps and metadata-only cookie fingerprints (names/paths/expiration — no values).

## Error Handling

- Storage failures in the review store reject and surface through the existing `{ ok: false, error }` response path and dashboard error banner.
- Corrupt/foreign data under `siteReviews` is dropped per-entry by a type guard (same approach as `isScanSnapshot`).
- `unmarkReviewed` for a missing key is a no-op success.

## Testing

Vitest units:

- `reviewStore`: get/set/remove round-trips, migration from legacy `reviewedSiteKeys`, corrupt-entry filtering.
- `reviewStatus`: new / residual / mixed / unknown-baseline / no-session cases.
- `inventoryBuilder`: fingerprint computation, omission when no session cookies, removal of date-filter behavior (update existing date-filter tests).
- `serviceWorker` router: markReviewed writes baseline + timestamp, unmarkReviewed deletes, scan leaves reviews untouched, responses carry `reviews`.
- `dashboard`: renders the three review states, excludes reviewed sites from bulk count and Critical/High tiles, Mark done ↔ Unmark toggle, cleared sites persist to storage.

Existing suites (62 tests) must keep passing; `npm run typecheck` and `npm run build` clean.
