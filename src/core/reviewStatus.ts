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
