import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLatestSnapshot, removeSitesFromLatestSnapshot, saveScanSnapshot } from './snapshotStore';
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
});
