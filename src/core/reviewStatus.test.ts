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

  it('reports plain reviewed for an explicitly empty current fingerprint list', () => {
    const emptySite: SiteInventory = { ...site(), likelySessionCookieFingerprints: [] };
    expect(deriveReviewStatus(emptySite, { reviewedAt: '2026-06-10T10:00:00.000Z', sessionCookieFingerprints: [FP_OLD] }))
      .toEqual({ reviewedAt: '2026-06-10T10:00:00.000Z', newSession: false, residualSession: false });
  });

  it('never claims a new session when the baseline is unknown (legacy review)', () => {
    expect(deriveReviewStatus(site([FP_NEW]), { reviewedAt: '2026-06-10T10:00:00.000Z' }))
      .toEqual({ reviewedAt: '2026-06-10T10:00:00.000Z', newSession: false, residualSession: false });
  });

  it('suppresses residual detection too when the baseline is unknown (legacy review)', () => {
    expect(deriveReviewStatus(site([FP_OLD]), { reviewedAt: '2026-06-10T10:00:00.000Z' }))
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
