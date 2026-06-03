import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServiceWorkerRouter, initServiceWorker } from './serviceWorker';
import { installChromeMock, sendRuntimeMessage } from '../test/chromeMocks';

describe('serviceWorker', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the dashboard when the extension action is clicked', () => {
    const chromeMock = installChromeMock();

    initServiceWorker({ chromeApi: chromeMock });
    chromeMock.__listeners.actionClicked[0]?.();

    expect(chromeMock.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://test/dashboard.html'
    });
  });

  it('routes scan messages through cookies, tabs, inventory builder, and snapshot storage', async () => {
    const chromeMock = installChromeMock();
    const inventory = [{
      siteKey: 'example.com',
      domains: ['.example.com'],
      cookieCount: 1,
      likelySessionCookieCount: 1,
      likelySessionCookieNames: ['sessionid'],
      openTabCount: 1,
      risk: 'high' as const,
      reasons: ['likely session/auth cookies present']
    }];
    const collectCookies = vi.fn().mockResolvedValue([{ name: 'sessionid', domain: '.example.com' }]);
    const collectTabs = vi.fn().mockResolvedValue([{ url: 'https://example.com', host: 'example.com', origin: 'https://example.com' }]);
    const buildInventory = vi.fn().mockReturnValue(inventory);

    initServiceWorker({
      chromeApi: chromeMock,
      collectCookies,
      collectTabs,
      buildInventory
    });

    const response = await sendRuntimeMessage(chromeMock, {
      type: 'scan',
      suspectedCompromiseDate: '2026-05-20'
    });

    expect(collectCookies).toHaveBeenCalledWith(chromeMock);
    expect(collectTabs).toHaveBeenCalledWith(chromeMock);
    expect(buildInventory).toHaveBeenCalledWith(
      [{ name: 'sessionid', domain: '.example.com' }],
      [{ url: 'https://example.com', host: 'example.com', origin: 'https://example.com' }],
      { suspectedCompromiseDate: '2026-05-20' }
    );
    expect(response).toMatchObject({
      ok: true,
      snapshot: {
        inventory,
        suspectedCompromiseDate: '2026-05-20'
      }
    });
    expect(JSON.stringify(chromeMock.__storage)).not.toContain('"value"');
  });

  it('routes latest snapshot, capabilities, cleanup, and mark-reviewed messages', async () => {
    const chromeMock = installChromeMock();
    const router = createServiceWorkerRouter({
      chromeApi: chromeMock,
      collectCookies: vi.fn(),
      collectTabs: vi.fn(),
      buildInventory: vi.fn(),
      clearLocalSiteData: vi.fn().mockResolvedValue({ status: 'completed', siteKey: 'github.com' })
    });

    const scan = await router({ type: 'scan' });
    expect(scan.ok).toBe(true);

    expect(await router({ type: 'getLatestSnapshot' })).toMatchObject({ ok: true });
    expect(await router({ type: 'getCapabilities' })).toMatchObject({
      ok: true,
      capabilities: { localCleanup: true }
    });
    expect(await router({ type: 'markReviewed', siteKey: 'github.com' })).toMatchObject({
      ok: true,
      snapshot: { reviewedSiteKeys: ['github.com'] }
    });
    expect(await router({
      type: 'clearLocalSiteData',
      siteKey: 'github.com',
      domains: ['.github.com'],
      origins: ['https://github.com']
    })).toMatchObject({
      ok: true,
      result: { status: 'completed', siteKey: 'github.com' }
    });
  });

  it('reports cleanup as unsupported when browsingData is unavailable', async () => {
    const chromeMock = installChromeMock();
    delete (chromeMock as Partial<typeof chromeMock>).browsingData;
    const router = createServiceWorkerRouter({
      chromeApi: chromeMock,
      collectCookies: vi.fn(),
      collectTabs: vi.fn(),
      buildInventory: vi.fn()
    });

    await expect(router({ type: 'getCapabilities' })).resolves.toMatchObject({
      ok: true,
      capabilities: { localCleanup: false }
    });
    await expect(router({
      type: 'clearLocalSiteData',
      siteKey: 'github.com',
      domains: ['.github.com'],
      origins: ['https://github.com']
    })).resolves.toMatchObject({
      ok: false,
      error: 'Local cleanup is not supported by this browser. Review provider sessions manually.'
    });
  });

  it('returns structured errors for failed scans', async () => {
    const router = createServiceWorkerRouter({
      chromeApi: installChromeMock(),
      collectCookies: vi.fn().mockRejectedValue(new Error('cookies permission denied')),
      collectTabs: vi.fn(),
      buildInventory: vi.fn()
    });

    await expect(router({ type: 'scan' })).resolves.toEqual({
      ok: false,
      error: 'cookies permission denied'
    });
  });

  it('runs the default scan path without browser window globals in the service worker context', async () => {
    const chromeMock = installChromeMock();
    const router = createServiceWorkerRouter({
      chromeApi: chromeMock,
      collectCookies: vi.fn().mockResolvedValue([{
        name: 'sessionid',
        domain: '.github.com',
        path: '/',
        hostOnly: false,
        httpOnly: true,
        secure: true,
        session: false,
        sameSite: 'lax',
        storeId: '0',
        partitioned: false
      }]),
      collectTabs: vi.fn().mockResolvedValue([])
    });

    const response = await router({ type: 'scan' });

    expect(response).toMatchObject({
      ok: true,
      snapshot: {
        inventory: [{
          siteKey: 'github.com',
          risk: 'critical',
          likelySessionCookieCount: 1
        }]
      }
    });
  });
});
