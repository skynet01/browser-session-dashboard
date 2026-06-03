import type { RedactedCookie } from '../core/types';

type ChromeApi = {
  runtime: { readonly lastError: { message?: string | undefined } | undefined };
  cookies: {
    getAll(details: chrome.cookies.GetAllDetails, callback: (cookies: chrome.cookies.Cookie[]) => void): void;
  };
};

export async function collectRedactedCookies(
  chromeApi: ChromeApi = chrome,
  fallbackUrls: string[] = []
): Promise<RedactedCookie[]> {
  const broadCookies = await getCookies({}, chromeApi);
  if (broadCookies.length > 0 || fallbackUrls.length === 0) {
    return broadCookies.map(redactCookie);
  }

  const fallbackCookies = await collectCookiesForUrls(fallbackUrls, chromeApi);
  return fallbackCookies.map(redactCookie);
}

async function collectCookiesForUrls(
  urls: string[],
  chromeApi: ChromeApi
): Promise<chrome.cookies.Cookie[]> {
  const byKey = new Map<string, chrome.cookies.Cookie>();

  for (const url of uniqueValidUrls(urls)) {
    const cookies = await getCookies({ url }, chromeApi);
    for (const cookie of cookies) {
      byKey.set(cookieKey(cookie), cookie);
    }
  }

  return [...byKey.values()];
}

async function getCookies(
  details: chrome.cookies.GetAllDetails,
  chromeApi: ChromeApi
): Promise<chrome.cookies.Cookie[]> {
  return await new Promise((resolve, reject) => {
    chromeApi.cookies.getAll(details, (cookies) => {
      const error = chromeError(chromeApi);
      if (error) {
        reject(error);
        return;
      }

      resolve(cookies);
    });
  });
}

function uniqueValidUrls(urls: string[]): string[] {
  const unique = new Set<string>();

  for (const value of urls) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
      url.hash = '';
      url.search = '';
      unique.add(url.href);
    } catch {
      continue;
    }
  }

  return [...unique].sort();
}

function cookieKey(cookie: chrome.cookies.Cookie): string {
  const partitionKey = 'partitionKey' in cookie && cookie.partitionKey !== undefined
    ? JSON.stringify(cookie.partitionKey)
    : '';
  return [
    cookie.storeId,
    cookie.domain,
    cookie.path,
    cookie.name,
    partitionKey
  ].join('\u0000');
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
