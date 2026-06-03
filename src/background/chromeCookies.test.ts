import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectRedactedCookies } from './chromeCookies';
import { installChromeMock } from '../test/chromeMocks';

describe('collectRedactedCookies', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('redacts cookie values immediately while preserving audit metadata', async () => {
    const chromeMock = installChromeMock();
    chromeMock.cookies.getAll = vi.fn((_details, callback) => {
      callback([
        {
          name: 'sessionid',
          value: 'secret-cookie-value',
          domain: '.example.com',
          hostOnly: false,
          path: '/',
          secure: true,
          httpOnly: true,
          session: false,
          sameSite: 'lax',
          expirationDate: 1_790_000_000,
          storeId: '0',
          partitionKey: { topLevelSite: 'https://example.com' }
        } as chrome.cookies.Cookie
      ]);
    });

    const cookies = await collectRedactedCookies(chromeMock);

    expect(chromeMock.cookies.getAll).toHaveBeenCalledWith({}, expect.any(Function));
    expect(cookies).toEqual([
      {
        name: 'sessionid',
        domain: '.example.com',
        path: '/',
        hostOnly: false,
        httpOnly: true,
        secure: true,
        session: false,
        sameSite: 'lax',
        expirationDate: 1_790_000_000,
        storeId: '0',
        partitioned: true
      }
    ]);
    expect(JSON.stringify(cookies)).not.toContain('secret-cookie-value');
    expect(JSON.stringify(cookies)).not.toContain('"value"');
  });

  it('surfaces Chrome API errors instead of returning an empty inventory', async () => {
    const chromeMock = installChromeMock();
    chromeMock.cookies.getAll = vi.fn((_details, callback) => {
      chromeMock.__setLastError('cookies permission denied');
      callback([]);
    });

    await expect(collectRedactedCookies(chromeMock)).rejects.toThrow('cookies permission denied');
  });

  it('falls back to URL-scoped cookie queries when broad enumeration is empty', async () => {
    const chromeMock = installChromeMock();
    chromeMock.cookies.getAll = vi.fn((details, callback) => {
      if ('url' in details && details.url === 'https://mail.google.com/') {
        callback([
          {
            name: 'SID',
            value: 'secret-google-cookie',
            domain: '.google.com',
            hostOnly: false,
            path: '/',
            secure: true,
            httpOnly: true,
            session: false,
            sameSite: 'no_restriction',
            storeId: '0'
          } as chrome.cookies.Cookie
        ]);
        return;
      }

      callback([]);
    });

    const cookies = await collectRedactedCookies(chromeMock, ['https://mail.google.com/']);

    expect(chromeMock.cookies.getAll).toHaveBeenCalledWith({}, expect.any(Function));
    expect(chromeMock.cookies.getAll).toHaveBeenCalledWith({ url: 'https://mail.google.com/' }, expect.any(Function));
    expect(cookies).toMatchObject([
      {
        name: 'SID',
        domain: '.google.com',
        httpOnly: true,
        secure: true
      }
    ]);
    expect(JSON.stringify(cookies)).not.toContain('secret-google-cookie');
  });
});
