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
    expect(chromeMock.__storage['siteReviews']).toEqual({
      'github.com': { reviewedAt: snapshot.scannedAt },
      'paypal.com': { reviewedAt: snapshot.scannedAt }
    });

    await saveScanSnapshot({
      inventory: [],
      reviewedSiteKeys: ['example.com']
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
