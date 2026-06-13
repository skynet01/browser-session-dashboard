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

    expect(collectTabs).toHaveBeenCalledWith(chromeMock);
    expect(collectCookies).toHaveBeenCalledWith(chromeMock, expect.arrayContaining([
      'https://google.com/',
      'https://myaccount.google.com/device-activity'
    ]));
    expect(buildInventory).toHaveBeenCalledWith(
      [{ name: 'sessionid', domain: '.example.com' }],
      [{ url: 'https://example.com', host: 'example.com', origin: 'https://example.com' }]
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

  it('reports missing all-site access when broad host permissions are not granted', async () => {
    const chromeMock = installChromeMock();
    const contains = vi.fn((_permissions: chrome.permissions.Permissions, callback: (granted: boolean) => void) => {
      callback(false);
    });
    (chromeMock as typeof chromeMock & {
      permissions: { contains: typeof contains };
    }).permissions = { contains };

    const router = createServiceWorkerRouter({
      chromeApi: chromeMock,
      collectCookies: vi.fn(),
      collectTabs: vi.fn(),
      buildInventory: vi.fn()
    });

    await expect(router({ type: 'getCapabilities' })).resolves.toMatchObject({
      ok: true,
      capabilities: {
        localCleanup: true,
        allSitesAccess: false
      }
    });
    expect(contains).toHaveBeenCalledWith({
      origins: ['http://*/*', 'https://*/*']
    }, expect.any(Function));
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
