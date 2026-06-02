import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLocalSiteData } from './chromeCleanup';
import { installChromeMock } from '../test/chromeMocks';

describe('clearLocalSiteData', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears local browsing data for normalized origins and returns an auditable redacted result', async () => {
    const chromeMock = installChromeMock();

    const result = await clearLocalSiteData({
      siteKey: 'example.com',
      domains: ['.example.com'],
      origins: ['https://app.example.com/account', 'chrome://extensions']
    }, chromeMock);

    expect(chromeMock.browsingData.remove).toHaveBeenCalledWith(
      {
        origins: [
          'https://app.example.com',
          'https://example.com',
          'http://example.com'
        ],
        originTypes: { unprotectedWeb: true, protectedWeb: true }
      },
      {
        cookies: true,
        cacheStorage: true,
        fileSystems: true,
        indexedDB: true,
        localStorage: true,
        serviceWorkers: true,
        webSQL: true
      },
      expect.any(Function)
    );
    expect(result.status).toBe('completed');
    expect(result.remoteRevocation).toBe('not_attempted');
    expect(result.warning).toContain('does not revoke already stolen cookies');
    expect(JSON.stringify(result)).not.toContain('"value"');
  });

  it('returns a failed audit result when browsingData reports an API error', async () => {
    const chromeMock = installChromeMock();
    chromeMock.browsingData.remove = vi.fn((_options, _dataTypes, callback) => {
      chromeMock.__setLastError('browsingData blocked by policy');
      callback?.();
    });

    await expect(clearLocalSiteData({ siteKey: 'example.com', origins: ['https://example.com'] }, chromeMock))
      .rejects.toThrow('browsingData blocked by policy');
  });
});
