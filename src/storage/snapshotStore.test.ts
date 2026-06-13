import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLatestSnapshot, removeSitesFromLatestSnapshot, saveScanSnapshot } from './snapshotStore';
import { installChromeMock } from '../test/chromeMocks';

describe('snapshotStore', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
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
    vi.useFakeTimers();
    let time = new Date('2026-06-11T10:00:00.000Z').getTime();
    const tick = () => {
      time += 1000;
      vi.setSystemTime(time);
    };

    const chromeMock = installChromeMock();
    tick();
    const saved = await saveScanSnapshot({
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
    for (let index = 0; index < 10; index += 1) {
      tick();
      await saveScanSnapshot({
        inventory: [{
          siteKey: `older-${index}.example`,
          domains: [`older-${index}.example`],
          cookieCount: 1,
          likelySessionCookieCount: 0,
          openTabCount: 0,
          risk: 'low',
          reasons: []
        }]
      }, chromeMock);
    }
    tick();
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
      ],
      reviewedSiteKeys: ['github.com', 'example.com']
    }, chromeMock);

    const updated = await removeSitesFromLatestSnapshot(['github.com'], chromeMock);

    expect(updated?.inventory.map((site) => site.siteKey)).toEqual(['example.com']);
    expect((await getLatestSnapshot(chromeMock))?.inventory.map((site) => site.siteKey)).toEqual(['example.com']);
    expect(updated?.reviewedSiteKeys).toEqual(['example.com']);

    const history = chromeMock.__storage['scanSnapshots'];
    if (!Array.isArray(history)) throw new Error('Expected snapshot history array');
    expect(history).toHaveLength(10);
    expect(history[0]).toMatchObject({
      id: updated?.id,
      inventory: [{ siteKey: 'example.com' }],
      reviewedSiteKeys: ['example.com']
    });
    expect(history.filter((item) => item.id === updated?.id)).toHaveLength(1);
    expect(history.find((item) => item.id === saved.id)).toBeUndefined();
  });
});
