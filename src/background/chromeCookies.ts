import type { RedactedCookie } from '../core/types';

type ChromeApi = {
  runtime: { readonly lastError: { message?: string | undefined } | undefined };
  cookies: {
    getAll(details: chrome.cookies.GetAllDetails, callback: (cookies: chrome.cookies.Cookie[]) => void): void;
  };
};

export async function collectRedactedCookies(
  chromeApi: ChromeApi = chrome
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

function chromeError(chromeApi: ChromeApi): Error | undefined {
  const message = chromeApi.runtime.lastError?.message;
  return message ? new Error(message) : undefined;
}
