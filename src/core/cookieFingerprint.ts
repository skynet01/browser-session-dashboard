import type { RedactedCookie } from './types';

export function cookieFingerprint(cookie: RedactedCookie): string {
  const expiry = cookie.session || cookie.expirationDate === undefined
    ? 'session'
    : String(Math.floor(cookie.expirationDate));

  return [cookie.name, cookie.domain, cookie.path, cookie.storeId, expiry].join('|');
}
