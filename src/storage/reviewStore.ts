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
