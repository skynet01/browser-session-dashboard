import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLatestSnapshot, markSiteReviewed, saveScanSnapshot } from './snapshotStore';
import { installChromeMock } from '../test/chromeMocks';

describe('snapshotStore', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists scan snapshots without cookie values', async () => {
    const chromeMock = installChromeMock();

    const snapshot = await saveScanSnapshot({
      inventory: [{
        siteKey: 'example.com',
        domains: ['.example.com'],
        cookieCount: 1,
        likelySessionCookieCount: 1,
        likelySessionCookieNames: ['sessionid'],
        openTabCount: 0,
        risk: 'high',
        reasons: ['likely session/auth cookies present'],
        leaked: { value: 'secret-cookie-value' }
      }],
      cookies: [{ name: 'sessionid', value: 'secret-cookie-value' }]
    }, chromeMock);

    expect(snapshot.id).toMatch(/^scan-/);
    expect(JSON.stringify(chromeMock.__storage)).not.toContain('secret-cookie-value');
    expect(JSON.stringify(chromeMock.__storage)).not.toContain('"value"');
  });

  it('retrieves the latest snapshot and marks sites reviewed', async () => {
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

    const reviewed = await markSiteReviewed('github.com', chromeMock);

    expect(reviewed?.reviewedSiteKeys).toEqual(['github.com']);
    expect((await getLatestSnapshot(chromeMock))?.reviewedSiteKeys).toEqual(['github.com']);
  });
});
