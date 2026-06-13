# Post-Review Session Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make review marks ("Mark done") survive rescans and clearly label sessions created after a review as not affected by the original cookie theft.

**Architecture:** Reviews move out of scan snapshots into their own `chrome.storage.local` key (`siteReviews`), keyed by site, holding a review timestamp plus a metadata-only fingerprint baseline of the site's likely-session cookies. A pure core function compares a scanned site's current fingerprints against the baseline to derive "new session" / "residual session" status. The dead suspected-compromise-date cookie filter is removed; the date becomes pure incident context.

**Tech Stack:** TypeScript, Vite, Vitest (jsdom for UI tests), Chrome MV3 extension APIs (`storage`, `cookies`, `tabs`, `browsingData`).

**Spec:** `docs/superpowers/specs/2026-06-11-post-review-sessions-design.md`

**Verification commands:** `npm test` (62 tests passing today), `npm run typecheck`, `npm run build`.

**Privacy invariant (applies to every task):** never read, store, or hash cookie *values*. Fingerprints are built only from name/domain/path/storeId/expiration metadata.

---

## File Structure

- Create: `src/core/cookieFingerprint.ts` (+ test) — metadata-only fingerprint of a redacted cookie.
- Create: `src/core/reviewStatus.ts` (+ test) — pure derivation of per-site review status.
- Create: `src/storage/chromeStorage.ts` — shared promisified `chrome.storage.local` helpers (extracted from `snapshotStore.ts`).
- Create: `src/storage/reviewStore.ts` (+ test) — persistent `siteReviews` map with legacy migration.
- Modify: `src/core/types.ts` — add `SiteReview`/`SiteReviews`, add `likelySessionCookieFingerprints` to `SiteInventory`, remove dead `creationDate` from `RedactedCookie`.
- Modify: `src/core/inventoryBuilder.ts` — emit fingerprints; delete date filtering and `InventoryBuildOptions`.
- Modify: `src/storage/snapshotStore.ts` — use shared storage helpers; remove `markSiteReviewed`; add `removeSitesFromLatestSnapshot`.
- Modify: `src/background/serviceWorker.ts` — review store integration, `unmarkReviewed` message, `reviews` in responses, snapshot pruning after cleanup.
- Modify: `src/ui/dashboard.ts`, `src/ui/dashboard.css` — review states, Unmark toggle, tiles, bulk exclusion, context copy, focus preservation.
- Modify: `README.md`, `PRIVACY.md` — date-context copy; document review storage.

---

### Task 1: Cookie fingerprints in core inventory

**Files:**
- Create: `src/core/cookieFingerprint.ts`
- Create: `src/core/cookieFingerprint.test.ts`
- Modify: `src/core/types.ts:48-59` (SiteInventory)
- Modify: `src/core/inventoryBuilder.ts` (buildSiteInventory)
- Modify: `src/core/inventoryBuilder.test.ts`

- [ ] **Step 1: Write the failing fingerprint test**

Create `src/core/cookieFingerprint.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { RedactedCookie } from './types';
import { cookieFingerprint } from './cookieFingerprint';

const baseCookie: RedactedCookie = {
  name: 'user_session',
  domain: '.github.com',
  path: '/',
  hostOnly: false,
  httpOnly: true,
  secure: true,
  session: false,
  sameSite: 'lax',
  expirationDate: 1_790_000_000.25,
  storeId: '0',
  partitioned: false
};

describe('cookieFingerprint', () => {
  it('fingerprints persistent cookies by identity metadata and whole-second expiry', () => {
    expect(cookieFingerprint(baseCookie)).toBe('user_session|.github.com|/|0|1790000000');
  });

  it('marks session-only cookies with a session expiry token', () => {
    expect(cookieFingerprint({ ...baseCookie, session: true, expirationDate: undefined }))
      .toBe('user_session|.github.com|/|0|session');
  });

  it('never includes a cookie value', () => {
    const withValue = { ...baseCookie, value: 'secret-cookie-value' } as RedactedCookie;
    expect(cookieFingerprint(withValue)).not.toContain('secret-cookie-value');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/cookieFingerprint.test.ts`
Expected: FAIL — `Cannot find module './cookieFingerprint'` (or equivalent resolve error).

- [ ] **Step 3: Implement `cookieFingerprint`**

Create `src/core/cookieFingerprint.ts`:

```ts
import type { RedactedCookie } from './types';

export function cookieFingerprint(cookie: RedactedCookie): string {
  const expiry = cookie.session || cookie.expirationDate === undefined
    ? 'session'
    : String(Math.floor(cookie.expirationDate));

  return [cookie.name, cookie.domain, cookie.path, cookie.storeId, expiry].join('|');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/cookieFingerprint.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing inventory test**

Add to the `describe('buildInventory', ...)` block in `src/core/inventoryBuilder.test.ts`:

```ts
  it('exposes sorted unique fingerprints for likely session cookies only', () => {
    const inventory = buildInventory(cookies, tabs);
    const github = inventory.find((site) => site.siteKey === 'github.com');
    const example = inventory.find((site) => site.siteKey === 'example.co.uk');

    expect(github?.likelySessionCookieFingerprints)
      .toEqual(['sessionid|.github.com|/|0|1790000000']);
    expect(example?.likelySessionCookieFingerprints).toBeUndefined();
  });
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/core/inventoryBuilder.test.ts`
Expected: FAIL — `likelySessionCookieFingerprints` is `undefined` for github.com.

- [ ] **Step 7: Add the field to `SiteInventory` and emit it from the builder**

In `src/core/types.ts`, add one line to `SiteInventory` after `likelySessionCookieNames`:

```ts
export type SiteInventory = {
  siteKey: string;
  domains: string[];
  cookieCount: number;
  likelySessionCookieCount: number;
  likelySessionCookieNames?: string[];
  likelySessionCookieFingerprints?: string[];
  openTabCount: number;
  risk: SiteRisk;
  reasons: string[];
  providerCategory?: ProviderCategory;
  providerAction?: ProviderAction;
};
```

In `src/core/inventoryBuilder.ts`, import the helper:

```ts
import { cookieFingerprint } from './cookieFingerprint';
```

and in `buildSiteInventory`, next to the existing `likelySessionCookieNames` handling:

```ts
  const likelySessionCookieNames = [...new Set(likelySessionCookies.map((cookie) => cookie.name))].sort();
  const likelySessionCookieFingerprints = [...new Set(likelySessionCookies.map(cookieFingerprint))].sort();

  if (likelySessionCookieNames.length > 0) inventory.likelySessionCookieNames = likelySessionCookieNames;
  if (likelySessionCookieFingerprints.length > 0) inventory.likelySessionCookieFingerprints = likelySessionCookieFingerprints;
```

- [ ] **Step 8: Run the suite to verify it passes**

Run: `npx vitest run src/core/`
Expected: PASS, including the new fingerprint tests.

- [ ] **Step 9: Commit**

```bash
git add src/core/cookieFingerprint.ts src/core/cookieFingerprint.test.ts src/core/types.ts src/core/inventoryBuilder.ts src/core/inventoryBuilder.test.ts
git commit -m "feat(core): fingerprint likely session cookies by metadata"
```

---

### Task 2: Remove the dead suspected-date cookie filter

Chrome never supplies cookie creation dates (`redactCookie` in `src/background/chromeCookies.ts` never sets `creationDate`), so this filter can never match. The date stays on scan requests/snapshots as incident context only.

**Files:**
- Modify: `src/core/types.ts:3-16` (RedactedCookie)
- Modify: `src/core/inventoryBuilder.ts` (delete filter + options)
- Modify: `src/core/inventoryBuilder.test.ts` (delete date-filter test)
- Modify: `src/background/serviceWorker.ts:1,69-73,105-117` (builder signature)
- Modify: `src/background/serviceWorker.test.ts:54-58` (builder call expectation)

- [ ] **Step 1: Update the tests first**

In `src/core/inventoryBuilder.test.ts`, delete the entire test `it('excludes cookies created after the suspected compromise date when creation metadata exists', ...)` (lines 85-119).

In `src/background/serviceWorker.test.ts`, change the `buildInventory` expectation in `it('routes scan messages through cookies, tabs, inventory builder, and snapshot storage', ...)`:

```ts
    expect(buildInventory).toHaveBeenCalledWith(
      [{ name: 'sessionid', domain: '.example.com' }],
      [{ url: 'https://example.com', host: 'example.com', origin: 'https://example.com' }]
    );
```

(The `{ suspectedCompromiseDate: '2026-05-20' }` third argument is removed; the same test still asserts the snapshot keeps `suspectedCompromiseDate: '2026-05-20'` — that stays.)

- [ ] **Step 2: Run tests to verify the new expectation fails**

Run: `npx vitest run src/background/serviceWorker.test.ts`
Expected: FAIL — `buildInventory` was called with three arguments, expectation wants two.

- [ ] **Step 3: Remove the filter and options from the builder**

In `src/core/inventoryBuilder.ts`:
- Delete the `InventoryBuildOptions` type, the `options` parameter, and the functions `filterCookiesBySuspectedDate` and `endOfDateSeconds`.
- The top of the file becomes:

```ts
export function buildInventory(
  cookies: RedactedCookie[],
  tabs: OpenTabSummary[]
): SiteInventory[] {
  const bySite = new Map<string, SiteGroup>();

  for (const cookie of cookies) {
    groupFor(bySite, getSiteKey(cookie.domain)).cookies.push(cookie);
  }
  // ... rest unchanged
```

In `src/core/types.ts`, delete the `creationDate?: number;` line from `RedactedCookie` (nothing populates it).

In `src/background/serviceWorker.ts`:
- Change the import to `import { buildInventory as defaultBuildInventory } from '../core/inventoryBuilder';` (drop `InventoryBuildOptions`).
- Change `RouterDependencies.buildInventory` to:

```ts
  buildInventory?: (
    cookies: RedactedCookie[],
    tabs: OpenTabSummary[]
  ) => SiteInventory[] | undefined | Promise<SiteInventory[] | undefined>;
```

- In the `scan` case, call without options:

```ts
          const inventory = (await buildInventoryFromInputs(cookies, tabs)) ?? [];
```

(`request.suspectedCompromiseDate` continues to be passed to `saveScanSnapshot` unchanged.)

- [ ] **Step 4: Run typecheck and full tests**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all tests PASS (the dashboard copy test still passes — its copy changes in Task 6).

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/inventoryBuilder.ts src/core/inventoryBuilder.test.ts src/background/serviceWorker.ts src/background/serviceWorker.test.ts
git commit -m "refactor(core): drop dead creation-date cookie filter"
```

---

### Task 3: Review types and status derivation

**Files:**
- Modify: `src/core/types.ts` (add SiteReview/SiteReviews)
- Create: `src/core/reviewStatus.ts`
- Create: `src/core/reviewStatus.test.ts`

- [ ] **Step 1: Add review types**

Append to `src/core/types.ts`:

```ts
export type SiteReview = {
  reviewedAt: string;
  sessionCookieFingerprints?: string[];
};

export type SiteReviews = Record<string, SiteReview>;
```

`sessionCookieFingerprints` absent means "baseline unknown" (legacy migrated reviews); an empty array means "no session cookies existed at review time".

- [ ] **Step 2: Write the failing derivation tests**

Create `src/core/reviewStatus.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { SiteInventory } from './types';
import { deriveReviewStatus } from './reviewStatus';

const FP_OLD = 'user_session|.github.com|/|0|1790000000';
const FP_NEW = 'user_session|.github.com|/|0|1795000000';

function site(fingerprints?: string[]): SiteInventory {
  return {
    siteKey: 'github.com',
    domains: ['.github.com'],
    cookieCount: 1,
    likelySessionCookieCount: fingerprints?.length ?? 0,
    openTabCount: 0,
    risk: 'critical',
    reasons: [],
    ...(fingerprints && fingerprints.length > 0 ? { likelySessionCookieFingerprints: fingerprints } : {})
  };
}

describe('deriveReviewStatus', () => {
  it('returns undefined when the site has no review record', () => {
    expect(deriveReviewStatus(site([FP_OLD]), undefined)).toBeUndefined();
  });

  it('reports plain reviewed when no session cookies are present', () => {
    expect(deriveReviewStatus(site(), { reviewedAt: '2026-06-10T10:00:00.000Z', sessionCookieFingerprints: [FP_OLD] }))
      .toEqual({ reviewedAt: '2026-06-10T10:00:00.000Z', newSession: false, residualSession: false });
  });

  it('never claims a new session when the baseline is unknown (legacy review)', () => {
    expect(deriveReviewStatus(site([FP_NEW]), { reviewedAt: '2026-06-10T10:00:00.000Z' }))
      .toEqual({ reviewedAt: '2026-06-10T10:00:00.000Z', newSession: false, residualSession: false });
  });

  it('flags a new session when fingerprints differ from the baseline', () => {
    expect(deriveReviewStatus(site([FP_NEW]), { reviewedAt: '2026-06-10T10:00:00.000Z', sessionCookieFingerprints: [FP_OLD] }))
      .toEqual({ reviewedAt: '2026-06-10T10:00:00.000Z', newSession: true, residualSession: false });
  });

  it('flags a new session against an empty baseline (logged out at review time)', () => {
    expect(deriveReviewStatus(site([FP_NEW]), { reviewedAt: '2026-06-10T10:00:00.000Z', sessionCookieFingerprints: [] }))
      .toEqual({ reviewedAt: '2026-06-10T10:00:00.000Z', newSession: true, residualSession: false });
  });

  it('flags residual session cookies that match the baseline', () => {
    expect(deriveReviewStatus(site([FP_OLD]), { reviewedAt: '2026-06-10T10:00:00.000Z', sessionCookieFingerprints: [FP_OLD] }))
      .toEqual({ reviewedAt: '2026-06-10T10:00:00.000Z', newSession: false, residualSession: true });
  });

  it('flags both when old and new session cookies coexist', () => {
    expect(deriveReviewStatus(site([FP_OLD, FP_NEW]), { reviewedAt: '2026-06-10T10:00:00.000Z', sessionCookieFingerprints: [FP_OLD] }))
      .toEqual({ reviewedAt: '2026-06-10T10:00:00.000Z', newSession: true, residualSession: true });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/core/reviewStatus.test.ts`
Expected: FAIL — module `./reviewStatus` not found.

- [ ] **Step 4: Implement `deriveReviewStatus`**

Create `src/core/reviewStatus.ts`:

```ts
import type { SiteInventory, SiteReview } from './types';

export type SiteReviewStatus = {
  reviewedAt: string;
  newSession: boolean;
  residualSession: boolean;
};

export function deriveReviewStatus(
  site: SiteInventory,
  review: SiteReview | undefined
): SiteReviewStatus | undefined {
  if (!review) return undefined;

  const current = site.likelySessionCookieFingerprints ?? [];
  if (current.length === 0 || review.sessionCookieFingerprints === undefined) {
    return { reviewedAt: review.reviewedAt, newSession: false, residualSession: false };
  }

  const baseline = new Set(review.sessionCookieFingerprints);

  return {
    reviewedAt: review.reviewedAt,
    newSession: current.some((fingerprint) => !baseline.has(fingerprint)),
    residualSession: current.some((fingerprint) => baseline.has(fingerprint))
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/core/reviewStatus.test.ts && npm run typecheck`
Expected: PASS (7 tests); typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/reviewStatus.ts src/core/reviewStatus.test.ts
git commit -m "feat(core): derive post-review session status from fingerprints"
```

---

### Task 4: Shared storage helpers + persistent review store

**Files:**
- Create: `src/storage/chromeStorage.ts`
- Modify: `src/storage/snapshotStore.ts` (use shared helpers; remove `markSiteReviewed`; add `removeSitesFromLatestSnapshot`)
- Modify: `src/storage/snapshotStore.test.ts`
- Create: `src/storage/reviewStore.ts`
- Create: `src/storage/reviewStore.test.ts`

- [ ] **Step 1: Extract shared storage helpers**

Create `src/storage/chromeStorage.ts` (moved verbatim from `snapshotStore.ts`, now exported):

```ts
export type ChromeStorageApi = {
  runtime: { readonly lastError: { message?: string | undefined } | undefined };
  storage: {
    local: {
      get(key: string, callback: (items: Record<string, unknown>) => void): void;
      set(items: Record<string, unknown>, callback?: () => void): void;
    };
  };
};

export async function storageGet(
  key: string,
  chromeApi: ChromeStorageApi
): Promise<Record<string, unknown>> {
  return await new Promise((resolve, reject) => {
    chromeApi.storage.local.get(key, (result) => {
      const error = chromeError(chromeApi);
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });
  });
}

export async function storageSet(
  items: Record<string, unknown>,
  chromeApi: ChromeStorageApi
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    chromeApi.storage.local.set(items, () => {
      const error = chromeError(chromeApi);
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function chromeError(chromeApi: ChromeStorageApi): Error | undefined {
  const message = chromeApi.runtime.lastError?.message;
  return message ? new Error(message) : undefined;
}
```

In `src/storage/snapshotStore.ts`:
- Replace the local `ChromeApi` type with `import { storageGet, storageSet, type ChromeStorageApi } from './chromeStorage';` and rename all `ChromeApi` parameter types to `ChromeStorageApi`.
- Delete the now-duplicated private `storageGet`, `storageSet`, and `chromeError` functions.

- [ ] **Step 2: Run existing storage tests to confirm the refactor is behavior-neutral**

Run: `npx vitest run src/storage/ && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 3: Replace `markSiteReviewed` with `removeSitesFromLatestSnapshot` — tests first**

In `src/storage/snapshotStore.test.ts`, replace the test `it('retrieves the latest snapshot and marks sites reviewed', ...)` (lines 33-54) with:

```ts
  it('retrieves the latest snapshot', async () => {
    const chromeMock = installChromeMock();
    const saved = await saveScanSnapshot({
      inventory: [{
        siteKey: 'github.com',
        domains: ['.github.com'],
        cookieCount: 2,
        likelySessionCookieCount: 1,
        likelySessionCookieNames: ['user_session'],
        openTabCount: 1,
        risk: 'critical',
        reasons: ['known high-value provider']
      }]
    }, chromeMock);

    expect(await getLatestSnapshot(chromeMock)).toMatchObject({ id: saved.id });
  });

  it('removes cleared sites from the stored latest snapshot and history', async () => {
    const chromeMock = installChromeMock();
    await saveScanSnapshot({
      inventory: [
        {
          siteKey: 'github.com',
          domains: ['.github.com'],
          cookieCount: 2,
          likelySessionCookieCount: 1,
          openTabCount: 1,
          risk: 'critical',
          reasons: ['known high-value provider']
        },
        {
          siteKey: 'example.com',
          domains: ['example.com'],
          cookieCount: 1,
          likelySessionCookieCount: 0,
          openTabCount: 0,
          risk: 'low',
          reasons: []
        }
      ]
    }, chromeMock);

    const updated = await removeSitesFromLatestSnapshot(['github.com'], chromeMock);

    expect(updated?.inventory.map((site) => site.siteKey)).toEqual(['example.com']);
    expect((await getLatestSnapshot(chromeMock))?.inventory.map((site) => site.siteKey)).toEqual(['example.com']);
  });
```

Update the import at the top of the file:

```ts
import { getLatestSnapshot, removeSitesFromLatestSnapshot, saveScanSnapshot } from './snapshotStore';
```

- [ ] **Step 4: Run to verify failure**

Run: `npx vitest run src/storage/snapshotStore.test.ts`
Expected: FAIL — `removeSitesFromLatestSnapshot` is not exported.

- [ ] **Step 5: Implement the snapshot changes**

In `src/storage/snapshotStore.ts`, add (leave `markSiteReviewed` in place for now — `serviceWorker.ts` still imports it; it is deleted in Task 5 together with its caller):

```ts
export async function removeSitesFromLatestSnapshot(
  siteKeys: string[],
  chromeApi: ChromeStorageApi = chrome
): Promise<ScanSnapshot | undefined> {
  const latest = await getLatestSnapshot(chromeApi);
  if (!latest) return undefined;

  const removed = new Set(siteKeys);
  const snapshot: ScanSnapshot = {
    ...latest,
    inventory: latest.inventory.filter((site) => !removed.has(site.siteKey)),
    reviewedSiteKeys: latest.reviewedSiteKeys.filter((key) => !removed.has(key))
  };
  const history = await getSnapshotHistory(chromeApi);

  await storageSet({
    [LATEST_SNAPSHOT_KEY]: snapshot,
    [SNAPSHOT_HISTORY_KEY]: [snapshot, ...history.filter((item) => item.id !== snapshot.id)].slice(0, MAX_HISTORY)
  }, chromeApi);

  return snapshot;
}
```

(`reviewedSiteKeys` stays on `ScanSnapshot` purely so previously stored snapshots keep parsing; nothing writes new values into it besides the legacy-compatible empty array in `saveScanSnapshot`.)

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run src/storage/snapshotStore.test.ts && npm run typecheck`
Expected: PASS, typecheck clean (`markSiteReviewed` is temporarily unused-but-exported until Task 5 removes it).

- [ ] **Step 7: Write the failing review store tests**

Create `src/storage/reviewStore.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSiteReviews, removeSiteReview, setSiteReview } from './reviewStore';
import { saveScanSnapshot } from './snapshotStore';
import { installChromeMock } from '../test/chromeMocks';

describe('reviewStore', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips review records', async () => {
    const chromeMock = installChromeMock();
    const review = {
      reviewedAt: '2026-06-11T10:00:00.000Z',
      sessionCookieFingerprints: ['user_session|.github.com|/|0|1790000000']
    };

    await setSiteReview('github.com', review, chromeMock);

    expect(await getSiteReviews(chromeMock)).toEqual({ 'github.com': review });

    await removeSiteReview('github.com', chromeMock);

    expect(await getSiteReviews(chromeMock)).toEqual({});
  });

  it('migrates legacy reviewedSiteKeys once, without a fingerprint baseline', async () => {
    const chromeMock = installChromeMock();
    const snapshot = await saveScanSnapshot({
      inventory: [],
      reviewedSiteKeys: ['github.com', 'paypal.com']
    }, chromeMock);

    expect(await getSiteReviews(chromeMock)).toEqual({
      'github.com': { reviewedAt: snapshot.scannedAt },
      'paypal.com': { reviewedAt: snapshot.scannedAt }
    });

    await removeSiteReview('github.com', chromeMock);

    expect(await getSiteReviews(chromeMock)).toEqual({
      'paypal.com': { reviewedAt: snapshot.scannedAt }
    });
  });

  it('returns an empty map when nothing is stored and no legacy snapshot exists', async () => {
    expect(await getSiteReviews(installChromeMock())).toEqual({});
  });

  it('drops corrupt entries instead of failing', async () => {
    const chromeMock = installChromeMock();
    chromeMock.__storage['siteReviews'] = {
      'github.com': { reviewedAt: '2026-06-11T10:00:00.000Z' },
      'bad-number.example': { reviewedAt: 42 },
      'bad-fingerprints.example': { reviewedAt: '2026-06-11T10:00:00.000Z', sessionCookieFingerprints: [1, 2] },
      'bad-shape.example': 'reviewed'
    };

    expect(await getSiteReviews(chromeMock)).toEqual({
      'github.com': { reviewedAt: '2026-06-11T10:00:00.000Z' }
    });
  });

  it('unmarking a missing site is a no-op', async () => {
    const chromeMock = installChromeMock();

    expect(await removeSiteReview('github.com', chromeMock)).toEqual({});
  });
});
```

- [ ] **Step 8: Run to verify failure**

Run: `npx vitest run src/storage/reviewStore.test.ts`
Expected: FAIL — module `./reviewStore` not found.

- [ ] **Step 9: Implement the review store**

Create `src/storage/reviewStore.ts`:

```ts
import type { SiteReview, SiteReviews } from '../core/types';
import { storageGet, storageSet, type ChromeStorageApi } from './chromeStorage';
import { getLatestSnapshot, type ScanSnapshot } from './snapshotStore';

const SITE_REVIEWS_KEY = 'siteReviews';

export async function getSiteReviews(
  chromeApi: ChromeStorageApi = chrome
): Promise<SiteReviews> {
  const result = await storageGet(SITE_REVIEWS_KEY, chromeApi);
  const stored = result[SITE_REVIEWS_KEY];
  if (stored !== undefined) return sanitizeReviews(stored);

  const migrated = migrateLegacyReviews(await getLatestSnapshot(chromeApi));
  await storageSet({ [SITE_REVIEWS_KEY]: migrated }, chromeApi);

  return migrated;
}

export async function setSiteReview(
  siteKey: string,
  review: SiteReview,
  chromeApi: ChromeStorageApi = chrome
): Promise<SiteReviews> {
  const updated = { ...(await getSiteReviews(chromeApi)), [siteKey]: review };
  await storageSet({ [SITE_REVIEWS_KEY]: updated }, chromeApi);

  return updated;
}

export async function removeSiteReview(
  siteKey: string,
  chromeApi: ChromeStorageApi = chrome
): Promise<SiteReviews> {
  const reviews = await getSiteReviews(chromeApi);
  if (!(siteKey in reviews)) return reviews;

  const updated = Object.fromEntries(
    Object.entries(reviews).filter(([key]) => key !== siteKey)
  );
  await storageSet({ [SITE_REVIEWS_KEY]: updated }, chromeApi);

  return updated;
}

function migrateLegacyReviews(snapshot: ScanSnapshot | undefined): SiteReviews {
  if (!snapshot || !Array.isArray(snapshot.reviewedSiteKeys)) return {};

  return Object.fromEntries(snapshot.reviewedSiteKeys.map((siteKey) => [
    siteKey,
    { reviewedAt: snapshot.scannedAt }
  ]));
}

function sanitizeReviews(value: unknown): SiteReviews {
  if (typeof value !== 'object' || value === null) return {};

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, SiteReview] => isSiteReview(entry[1]))
  );
}

function isSiteReview(value: unknown): value is SiteReview {
  if (typeof value !== 'object' || value === null) return false;

  const review = value as { reviewedAt?: unknown; sessionCookieFingerprints?: unknown };
  if (typeof review.reviewedAt !== 'string') return false;

  return review.sessionCookieFingerprints === undefined
    || (Array.isArray(review.sessionCookieFingerprints)
      && review.sessionCookieFingerprints.every((fingerprint) => typeof fingerprint === 'string'));
}
```

- [ ] **Step 10: Run to verify pass**

Run: `npx vitest run src/storage/`
Expected: PASS (all storage tests).

- [ ] **Step 11: Commit**

```bash
git add src/storage/chromeStorage.ts src/storage/snapshotStore.ts src/storage/snapshotStore.test.ts src/storage/reviewStore.ts src/storage/reviewStore.test.ts
git commit -m "feat(storage): persist site reviews independently of scans"
```

---

### Task 5: Service worker routing for persistent reviews

**Files:**
- Modify: `src/background/serviceWorker.ts`
- Modify: `src/background/serviceWorker.test.ts`

- [ ] **Step 1: Update the router tests first**

In `src/background/serviceWorker.test.ts`, replace the test `it('routes latest snapshot, capabilities, cleanup, and mark-reviewed messages', ...)` (lines 69-100) with:

```ts
  it('routes latest snapshot, capabilities, cleanup, and review messages', async () => {
    const chromeMock = installChromeMock();
    const inventory = [{
      siteKey: 'github.com',
      domains: ['.github.com'],
      cookieCount: 2,
      likelySessionCookieCount: 1,
      likelySessionCookieNames: ['user_session'],
      likelySessionCookieFingerprints: ['user_session|.github.com|/|0|1790000000'],
      openTabCount: 1,
      risk: 'critical' as const,
      reasons: ['known high-value provider']
    }];
    const router = createServiceWorkerRouter({
      chromeApi: chromeMock,
      collectCookies: vi.fn(),
      collectTabs: vi.fn(),
      buildInventory: vi.fn().mockReturnValue(inventory),
      clearLocalSiteData: vi.fn().mockResolvedValue({ status: 'completed', siteKey: 'github.com' })
    });

    const scan = await router({ type: 'scan' });
    expect(scan).toMatchObject({ ok: true, reviews: {} });

    expect(await router({ type: 'getLatestSnapshot' })).toMatchObject({
      ok: true,
      snapshot: { inventory },
      reviews: {}
    });
    expect(await router({ type: 'getCapabilities' })).toMatchObject({
      ok: true,
      capabilities: { localCleanup: true }
    });

    const marked = await router({ type: 'markReviewed', siteKey: 'github.com' });
    expect(marked).toMatchObject({
      ok: true,
      reviews: {
        'github.com': {
          sessionCookieFingerprints: ['user_session|.github.com|/|0|1790000000']
        }
      }
    });

    const cleared = await router({
      type: 'clearLocalSiteData',
      siteKey: 'github.com',
      domains: ['.github.com'],
      origins: ['https://github.com']
    });
    expect(cleared).toMatchObject({
      ok: true,
      result: { status: 'completed', siteKey: 'github.com' },
      snapshot: { inventory: [] }
    });

    const unmarked = await router({ type: 'unmarkReviewed', siteKey: 'github.com' });
    expect(unmarked).toMatchObject({ ok: true, reviews: {} });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/background/serviceWorker.test.ts`
Expected: FAIL — `unmarkReviewed` is rejected as an unsupported message, scan response lacks `reviews`.

- [ ] **Step 3: Implement the router changes**

In `src/background/serviceWorker.ts`:

Imports — replace the snapshotStore import line and add the review store:

```ts
import type { OpenTabSummary, RedactedCookie, SiteInventory, SiteReviews } from '../core/types';
import { getLatestSnapshot, removeSitesFromLatestSnapshot, saveScanSnapshot, type ScanSnapshot } from '../storage/snapshotStore';
import { getSiteReviews, removeSiteReview, setSiteReview } from '../storage/reviewStore';
```

Request/response types:

```ts
type RuntimeRequest =
  | { type: 'scan'; suspectedCompromiseDate?: string }
  | { type: 'getCapabilities' }
  | { type: 'getLatestSnapshot' }
  | { type: 'markReviewed'; siteKey: string }
  | { type: 'unmarkReviewed'; siteKey: string }
  | ({ type: 'clearLocalSiteData' } & LocalCleanupRequest);

type RuntimeResponse =
  | {
      ok: true;
      snapshot?: ScanSnapshot;
      result?: LocalCleanupResult;
      capabilities?: ExtensionCapabilities;
      reviews?: SiteReviews;
    }
  | { ok: false; error: string };
```

Switch cases:

```ts
        case 'scan': {
          const cookies = (await collectCookies(chromeApi, getKnownProviderCookieUrls())) ?? [];
          const tabs = (await collectTabs(chromeApi)) ?? [];
          const inventory = (await buildInventoryFromInputs(cookies, tabs)) ?? [];
          const snapshot = await saveScanSnapshot({
            inventory,
            suspectedCompromiseDate: request.suspectedCompromiseDate
          }, chromeApi);

          return { ok: true, snapshot, reviews: await getSiteReviews(chromeApi) };
        }
        case 'getLatestSnapshot':
          return {
            ...responseWithSnapshot(await getLatestSnapshot(chromeApi)),
            reviews: await getSiteReviews(chromeApi)
          };
        case 'getCapabilities':
          return { ok: true, capabilities: await browserCapabilities(chromeApi) };
        case 'markReviewed': {
          const latest = await getLatestSnapshot(chromeApi);
          const site = latest?.inventory.find((item) => item.siteKey === request.siteKey);
          const reviews = await setSiteReview(request.siteKey, {
            reviewedAt: new Date().toISOString(),
            sessionCookieFingerprints: site?.likelySessionCookieFingerprints ?? []
          }, chromeApi);

          return { ...responseWithSnapshot(latest), reviews };
        }
        case 'unmarkReviewed':
          return { ok: true, reviews: await removeSiteReview(request.siteKey, chromeApi) };
        case 'clearLocalSiteData': {
          const result = await clearSiteData(request, chromeApi);
          const snapshot = await removeSitesFromLatestSnapshot([request.siteKey], chromeApi);

          return { ok: true, result, ...(snapshot ? { snapshot } : {}) };
        }
```

In `isRuntimeRequest`, add `'unmarkReviewed'` to the accepted types:

```ts
  return type === 'getLatestSnapshot'
    || type === 'getCapabilities'
    || type === 'markReviewed'
    || type === 'unmarkReviewed'
    || type === 'clearLocalSiteData';
```

Finally, delete the now-unused `markSiteReviewed` function from `src/storage/snapshotStore.ts` (its caller is gone as of this task).

- [ ] **Step 4: Run background tests and typecheck**

Run: `npx vitest run src/background/ && npm run typecheck`
Expected: PASS, typecheck clean (the `markSiteReviewed` import gap from Task 4 is now resolved).

- [ ] **Step 5: Commit**

```bash
git add src/background/serviceWorker.ts src/background/serviceWorker.test.ts src/storage/snapshotStore.ts
git commit -m "feat(background): route persistent reviews and unmark messages"
```

---

### Task 6: Dashboard review states and copy

**Files:**
- Modify: `src/ui/dashboard.ts`
- Modify: `src/ui/dashboard.test.ts`

- [ ] **Step 1: Update existing dashboard tests and add review-state tests**

In `src/ui/dashboard.test.ts`:

(a) Extend the fixture so github.com has fingerprints — in the `snapshot` constant, add to the github.com entry after `likelySessionCookieNames`:

```ts
      likelySessionCookieFingerprints: ['user_session|.github.com|/|0|1790000000'],
```

(b) In the first test (`scans and renders prioritized redacted inventory...`), replace the date-filter copy assertion:

```ts
    expect(text).toContain('Response date May 20, 2026');
    expect(text).toContain('shown for incident context');
    expect(text).not.toContain('Cookies with known creation dates after that date are hidden');
```

(c) Replace the test `test('records reviewed sites and turns completed rows green', ...)` with:

```ts
  test('marks sites reviewed, shows the reviewed state, and supports unmarking', async () => {
    const sendMessage = installRuntimeMock([
      { ok: true },
      { ok: true, snapshot },
      {
        ok: true,
        snapshot,
        reviews: {
          'github.com': {
            reviewedAt: '2026-06-11T10:00:00.000Z',
            sessionCookieFingerprints: ['user_session|.github.com|/|0|1790000000']
          }
        }
      },
      { ok: true, reviews: {} }
    ]);

    await import('./dashboard');
    document.querySelector<HTMLButtonElement>('[data-action="scan"]')?.click();
    await waitForAsyncUi();

    document.querySelector<HTMLButtonElement>('[data-action="review"][data-site="github.com"]')?.click();
    await waitForAsyncUi();

    expect(sendMessage).toHaveBeenCalledWith({ type: 'markReviewed', siteKey: 'github.com' });
    const row = document.querySelector<HTMLElement>('[data-site-row="github.com"]');
    expect(row?.classList.contains('is-reviewed')).toBe(true);
    expect(row?.classList.contains('is-new-session')).toBe(false);
    expect(normalizedText()).toContain('Reviewed');
    expect(normalizedText()).toContain('Same session cookies as at review time.');
    expect(normalizedText()).toContain('Unmark');

    document.querySelector<HTMLButtonElement>('[data-action="unreview"][data-site="github.com"]')?.click();
    await waitForAsyncUi();

    expect(sendMessage).toHaveBeenCalledWith({ type: 'unmarkReviewed', siteKey: 'github.com' });
    expect(document.querySelector<HTMLElement>('[data-site-row="github.com"]')?.classList.contains('is-reviewed')).toBe(false);
    expect(normalizedText()).toContain('Mark done');
  });

  test('labels changed sessions on reviewed sites as new and not affected', async () => {
    installRuntimeMock([{
      ok: true,
      snapshot,
      reviews: {
        'github.com': {
          reviewedAt: '2026-06-10T10:00:00.000Z',
          sessionCookieFingerprints: ['user_session|.github.com|/|0|1700000000']
        }
      }
    }]);

    await import('./dashboard');
    await waitForAsyncUi();

    const row = document.querySelector<HTMLElement>('[data-site-row="github.com"]');
    expect(row?.classList.contains('is-new-session')).toBe(true);
    expect(normalizedText()).toContain('New session');
    expect(normalizedText()).toContain('this session was created after the theft and is not affected');
  });

  test('excludes reviewed sites from high-severity counts and bulk cleanup', async () => {
    installRuntimeMock([{
      ok: true,
      snapshot,
      reviews: {
        'github.com': {
          reviewedAt: '2026-06-10T10:00:00.000Z',
          sessionCookieFingerprints: ['user_session|.github.com|/|0|1700000000']
        }
      }
    }]);

    await import('./dashboard');
    await waitForAsyncUi();

    const text = normalizedText();
    expect(text).toContain('Critical 0');
    expect(text).toContain('Reviewed 1');
    expect(text).toContain('Clear high-severity sessions (0)');
    expect(document.querySelector<HTMLButtonElement>('[data-action="clear-high-risk"]')?.disabled).toBe(true);
  });
```

(d) In `test('requires confirmation before local cleanup and removes cleared sites from the dashboard', ...)`, change the cleanup response (third mock entry) to include the pruned snapshot, verifying the dashboard uses the persisted result:

```ts
      {
        ok: true,
        snapshot: { ...snapshot, inventory: [snapshot.inventory[1]!] },
        result: {
          siteKey: 'github.com',
          status: 'completed',
          warning: 'Local cleanup logs out this browser profile, but it does not revoke already stolen cookies.'
        }
      }
```

(The assertions in that test stay the same — github.com row disappears, example.com remains.)

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run src/ui/dashboard.test.ts`
Expected: FAIL — no `unreview` action, no review notes, old copy still rendered, tiles unchanged.

- [ ] **Step 3: Implement the dashboard changes**

In `src/ui/dashboard.ts`:

Imports:

```ts
import './dashboard.css';
import type { SiteInventory, SiteReviews, SiteRisk } from '../core/types';
import { deriveReviewStatus, type SiteReviewStatus } from '../core/reviewStatus';
import type { LocalCleanupResult } from '../background/chromeCleanup';
import type { ScanSnapshot } from '../storage/snapshotStore';
import { escapeHtml, pluralize, riskLabel, sentenceCase, siteMatchesQuery } from './components';
```

Request/response/state types:

```ts
type RuntimeRequest =
  | { type: 'scan'; suspectedCompromiseDate?: string }
  | { type: 'getCapabilities' }
  | { type: 'getLatestSnapshot' }
  | { type: 'markReviewed'; siteKey: string }
  | { type: 'unmarkReviewed'; siteKey: string }
  | { type: 'clearLocalSiteData'; siteKey: string; domains: string[]; origins: string[] };

type RuntimeResponse =
  | {
      ok: true;
      snapshot?: ScanSnapshot;
      result?: LocalCleanupResult;
      capabilities?: ExtensionCapabilities;
      reviews?: SiteReviews;
    }
  | { ok: false; error: string };

type DashboardState = {
  snapshot?: ScanSnapshot;
  reviews: SiteReviews;
  severity: SiteRisk | 'all';
  query: string;
  suspectedCompromiseDate: string;
  loading: boolean;
  error?: string;
  capabilities: ExtensionCapabilities;
  actionLog: string[];
};

const state: DashboardState = {
  reviews: {},
  severity: 'all',
  query: '',
  suspectedCompromiseDate: '',
  loading: false,
  capabilities: { localCleanup: true },
  actionLog: []
};
```

`loadLatestSnapshot` — after `state.snapshot = response.snapshot;` handling, adopt reviews from any ok response:

```ts
  if (response.ok && response.reviews) {
    state.reviews = response.reviews;
  }
```

(Place this before the final `render()`, outside the snapshot `if`, so reviews load even when no snapshot exists yet.)

`scan()` — same adoption after a successful scan:

```ts
  if (response.ok && response.snapshot) {
    state.snapshot = response.snapshot;
    if (response.reviews) state.reviews = response.reviews;
    state.actionLog = [`Scan completed at ${formatDate(response.snapshot.scannedAt)}`, ...state.actionLog];
  } else {
```

`handleClick` — add the unreview branch next to the review branch:

```ts
  if (action === 'review') {
    await markReviewed(site);
  }

  if (action === 'unreview') {
    await unmarkReviewed(site);
  }
```

Replace `markReviewed` and add `unmarkReviewed`:

```ts
async function markReviewed(site: SiteInventory): Promise<void> {
  const response = await sendMessage({ type: 'markReviewed', siteKey: site.siteKey });

  if (response.ok && response.reviews) {
    state.reviews = response.reviews;
    if (response.snapshot) state.snapshot = response.snapshot;
    state.actionLog = [`${site.siteKey}: marked reviewed`, ...state.actionLog];
  } else {
    state.error = response.ok ? 'Reviewed state was not updated.' : response.error;
  }

  render();
}

async function unmarkReviewed(site: SiteInventory): Promise<void> {
  const response = await sendMessage({ type: 'unmarkReviewed', siteKey: site.siteKey });

  if (response.ok && response.reviews) {
    state.reviews = response.reviews;
    state.actionLog = [`${site.siteKey}: review mark removed`, ...state.actionLog];
  } else {
    state.error = response.ok ? 'Reviewed state was not updated.' : response.error;
  }

  render();
}
```

`clearSite` — prefer the persisted snapshot returned by the background:

```ts
  if (response.ok && response.result) {
    if (response.snapshot) {
      state.snapshot = response.snapshot;
    } else {
      removeSitesFromSnapshot([site.siteKey]);
    }
    state.actionLog = [
```

`clearHighSeveritySessions` — track the last returned snapshot in the loop:

```ts
  const cleared: string[] = [];
  const failures: string[] = [];
  let updatedSnapshot: ScanSnapshot | undefined;

  for (const site of targets) {
    const response = await sendMessage(cleanupRequestForSite(site));
    if (response.ok && response.result) {
      cleared.push(site.siteKey);
      if (response.snapshot) updatedSnapshot = response.snapshot;
    } else {
      failures.push(site.siteKey);
    }
  }

  if (cleared.length > 0) {
    if (updatedSnapshot) {
      state.snapshot = updatedSnapshot;
    } else {
      removeSitesFromSnapshot(cleared);
    }
    state.actionLog = [
```

`highSeveritySessionSites` — reviewed sites are excluded:

```ts
function highSeveritySessionSites(): SiteInventory[] {
  return (state.snapshot?.inventory ?? []).filter((site) =>
    (site.risk === 'critical' || site.risk === 'high')
    && site.likelySessionCookieCount > 0
    && !state.reviews[site.siteKey]
  );
}
```

`render()` — summary tiles count unreviewed sites for severity, add a Reviewed tile; replace the context strip copy; preserve focus. Changed portions:

```ts
function render(): void {
  if (!app) return;

  const focused = captureFocus();
  const inventory = state.snapshot?.inventory ?? [];
  const unreviewed = inventory.filter((site) => !state.reviews[site.siteKey]);
  const reviewedCount = inventory.length - unreviewed.length;
  const filtered = filteredInventory(inventory);
  const bulkCleanupCount = highSeveritySessionSites().length;
```

In the summary grid:

```ts
    <section class="summary-grid" aria-label="Scan summary">
      ${summaryTile('Sites', pluralize(inventory.length, 'site'))}
      ${summaryTile('Critical', String(countRisk(unreviewed, 'critical')))}
      ${summaryTile('High', String(countRisk(unreviewed, 'high')))}
      ${summaryTile('Reviewed', String(reviewedCount))}
      ${summaryTile('Response date', state.snapshot?.suspectedCompromiseDate ? formatDateOnly(state.snapshot.suspectedCompromiseDate) : 'Not set')}
      ${summaryTile('Scanned', state.snapshot ? formatDate(state.snapshot.scannedAt) : 'Not yet')}
    </section>
```

Context strip:

```ts
    ${state.snapshot?.suspectedCompromiseDate ? `
      <section class="context-strip">
        ${escapeHtml(formatDateOnly(state.snapshot.suspectedCompromiseDate))} is the suspected compromise date, shown for incident context.
        Chrome does not expose cookie creation dates, so cookies cannot be filtered by date — sessions you reviewed are tracked per site instead.
      </section>
    ` : ''}
```

At the end of `render()`, after setting `app.innerHTML`:

```ts
  restoreFocus(focused);
```

Add the focus helpers near `render()`:

```ts
type FocusSnapshot = {
  control: string;
  selectionStart: number | null;
  selectionEnd: number | null;
};

function captureFocus(): FocusSnapshot | undefined {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !active.dataset.control) return undefined;

  const selectable = active instanceof HTMLInputElement && (active.type === 'search' || active.type === 'text');

  return {
    control: active.dataset.control,
    selectionStart: selectable ? active.selectionStart : null,
    selectionEnd: selectable ? active.selectionEnd : null
  };
}

function restoreFocus(focused: FocusSnapshot | undefined): void {
  if (!focused || !app) return;

  const element = app.querySelector<HTMLElement>(`[data-control="${focused.control}"]`);
  if (!element) return;

  element.focus();
  if (element instanceof HTMLInputElement && focused.selectionStart !== null) {
    element.setSelectionRange(focused.selectionStart, focused.selectionEnd);
  }
}
```

`renderSiteRow` — review-aware classes, pill, note, and toggle button:

```ts
function renderSiteRow(site: SiteInventory): string {
  const status = deriveReviewStatus(site, state.reviews[site.siteKey]);
  const primaryAction = site.providerAction ?? loginActionForSite(site.siteKey);
  const rowClasses = [
    'site-row',
    `risk-${site.risk}`,
    status ? 'is-reviewed' : '',
    status?.newSession ? 'is-new-session' : ''
  ].filter(Boolean).join(' ');

  return `
    <article class="${rowClasses}" data-site-row="${escapeHtml(site.siteKey)}">
      <div class="site-main">
        <div class="site-title">
          <h2>${escapeHtml(site.siteKey)}</h2>
          <span class="risk-pill">${riskLabel(site.risk)}</span>
          ${site.providerCategory ? `<span class="category-pill">${escapeHtml(site.providerCategory)}</span>` : ''}
          ${reviewPill(status)}
        </div>
        <p class="domains">${escapeHtml(site.domains.join(', ') || site.siteKey)}</p>
        ${reviewNote(status)}
        <ul class="reason-list">
          ${site.reasons.map((reason) => `<li>${escapeHtml(sentenceCase(reason))}</li>`).join('')}
        </ul>
      </div>
      <div class="site-metrics">
        ${metric('Cookies', site.cookieCount)}
        ${metric('Likely sessions', site.likelySessionCookieCount)}
        ${metric('Open tabs', site.openTabCount)}
      </div>
      <div class="row-actions row-actions--right">
        <a class="button-link" href="${escapeHtml(primaryAction.url)}" target="_blank" rel="noreferrer" data-action="${site.providerAction ? 'provider' : 'login'}" data-site="${escapeHtml(site.siteKey)}">${escapeHtml(primaryAction.label)}</a>
        <button type="button" class="secondary" data-action="clear" data-site="${escapeHtml(site.siteKey)}" ${state.capabilities.localCleanup ? '' : 'disabled'}>${state.capabilities.localCleanup ? 'Clear local data' : 'Cleanup unavailable'}</button>
        <button type="button" class="ghost" data-action="${status ? 'unreview' : 'review'}" data-site="${escapeHtml(site.siteKey)}">${status ? 'Unmark' : 'Mark done'}</button>
      </div>
    </article>
  `;
}

function reviewPill(status: SiteReviewStatus | undefined): string {
  if (!status) return '';
  if (status.newSession) return '<span class="new-session-pill">New session</span>';

  return `<span class="reviewed-pill">Reviewed ${escapeHtml(formatDate(status.reviewedAt))}</span>`;
}

function reviewNote(status: SiteReviewStatus | undefined): string {
  const notes: string[] = [];

  if (status?.newSession) {
    notes.push(
      `Session cookies changed since your review on ${formatDate(status.reviewedAt)} — if you revoked sessions then, this session was created after the theft and is not affected.`
    );
    if (status.residualSession) {
      notes.push('Some cookies from before the review are still present.');
    }
  } else if (status?.residualSession) {
    notes.push('Same session cookies as at review time.');
  }

  return notes.length > 0 ? `<p class="review-note">${notes.map(escapeHtml).join(' ')}</p>` : '';
}
```

- [ ] **Step 4: Run UI tests and typecheck**

Run: `npx vitest run src/ui/ && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/dashboard.ts src/ui/dashboard.test.ts
git commit -m "feat(ui): show persistent reviews and post-review session state"
```

---

### Task 7: Styles for new-session state and a search focus test

**Files:**
- Modify: `src/ui/dashboard.css` (after the `.reviewed-pill` rule, around line 396)
- Modify: `src/ui/dashboard.test.ts` (add focus test)

- [ ] **Step 1: Add the focus-retention test**

Add to `src/ui/dashboard.test.ts`:

```ts
  test('keeps focus in the search box while typing', async () => {
    installRuntimeMock([{ ok: true, snapshot }]);

    await import('./dashboard');
    await waitForAsyncUi();

    const search = document.querySelector<HTMLInputElement>('[data-control="search"]')!;
    search.focus();
    search.value = 'git';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    const searchAfterRender = document.querySelector<HTMLInputElement>('[data-control="search"]')!;
    expect(document.activeElement).toBe(searchAfterRender);
    expect(searchAfterRender.value).toBe('git');
  });
```

- [ ] **Step 2: Run to verify it passes (focus code shipped in Task 6)**

Run: `npx vitest run src/ui/dashboard.test.ts`
Expected: PASS. If it fails, fix `captureFocus`/`restoreFocus` from Task 6 before continuing.

- [ ] **Step 3: Add the CSS**

In `src/ui/dashboard.css`, immediately after the `.reviewed-pill { ... }` rule:

```css
.site-row.is-new-session {
  border-color: oklch(0.7 0.13 145);
  background:
    linear-gradient(180deg, oklch(0.91 0.07 145), transparent 92px),
    oklch(0.985 0.022 145);
}

.new-session-pill {
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  padding: 4px 9px;
  text-transform: uppercase;
  background: oklch(0.52 0.13 145);
  color: var(--surface);
}

.review-note {
  color: oklch(0.4 0.09 145);
  font-size: 0.82rem;
  margin: 4px 0 0;
}
```

- [ ] **Step 4: Build and verify**

Run: `npm run build && npm test`
Expected: build succeeds; all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/dashboard.css src/ui/dashboard.test.ts
git commit -m "style(ui): green new-session treatment and stable search focus"
```

---

### Task 8: Documentation and final verification

**Files:**
- Modify: `README.md` ("What It Does" bullets)
- Modify: `PRIVACY.md` (stored-data list, effective date)

- [ ] **Step 1: Update README**

In `README.md`, replace the bullet:

> `- Supports an optional suspected compromise date. Cookies with known creation dates after that date are filtered out when browser metadata is available.`

with:

```markdown
- Supports an optional suspected compromise date, shown as incident context. Chrome does not expose cookie creation dates, so cookies are never filtered by date.
- Remembers reviewed sites across scans, and labels sessions whose cookies changed after your review as new sessions that were not affected by the original theft.
```

and replace the bullet `- Lets you mark reviewed sites as done.` with:

```markdown
- Lets you mark reviewed sites as done, and unmark them later.
```

- [ ] **Step 2: Update PRIVACY.md**

In the "Data The Extension Handles" list, change the last bullet to:

```markdown
- Redacted scan timestamps, optional suspected compromise date, risk labels, reasons, provider categories, provider action links, review timestamps, and metadata-only session-cookie fingerprints (cookie name, domain, path, store ID, and expiration — never cookie values).
```

In "Local Storage", change the first paragraph to:

```markdown
The extension stores redacted scan snapshots and per-site review records (review timestamp plus metadata-only session-cookie fingerprints) in `chrome.storage.local` so the dashboard can remember the latest scan and reviewed state across reloads and rescans.
```

Update the effective date line to `Effective date: 2026-06-11`.

- [ ] **Step 3: Full verification**

Run: `npm run typecheck && npm test && npm run build && npm run build:safari-dist`
Expected: all clean; test count has grown from 62 (roughly 80+).

- [ ] **Step 4: Commit**

```bash
git add README.md PRIVACY.md
git commit -m "docs: describe persistent reviews and date-context behavior"
```

- [ ] **Step 5: Manual smoke check (Chrome)**

1. Load `dist/` as an unpacked extension; open the dashboard; run a scan.
2. Mark a logged-in site (e.g., github.com) as done → row turns green with "Reviewed".
3. Rescan → the review survives; the row shows "Reviewed" with "Same session cookies as at review time."
4. In that site, log out and back in (or revoke sessions and re-login), rescan → row shows the green "New session" pill and the not-affected note.
5. Click "Unmark" → row returns to normal severity treatment and counts.
6. Confirm Critical/High tiles and the bulk-clear count exclude the reviewed site.
