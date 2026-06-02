import type { RedactedCookie } from '../core/types';
import { chromeError, defaultChromeApi, type ChromeApi } from './chromeApi';

export async function collectRedactedCookies(
  chromeApi: ChromeApi = defaultChromeApi()
): Promise<RedactedCookie[]> {
  return await new Promise((resolve, reject) => {
    chromeApi.cookies.getAll({}, (cookies) => {
      const error = chromeError(chromeApi);
      if (error) {
        reject(error);
        return;
      }

      resolve(cookies.map(redactCookie));
    });
  });
}

function redactCookie(cookie: chrome.cookies.Cookie): RedactedCookie {
  const redacted: RedactedCookie = {
    name: cookie.name,
    domain: cookie.domain,
    path: cookie.path,
    hostOnly: cookie.hostOnly,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    session: cookie.session,
    sameSite: cookie.sameSite,
    storeId: cookie.storeId,
    partitioned: 'partitionKey' in cookie && cookie.partitionKey !== undefined
  };

  if (cookie.expirationDate !== undefined) {
    redacted.expirationDate = cookie.expirationDate;
  }

  return redacted;
}
