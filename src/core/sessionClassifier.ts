import type { RedactedCookie } from './types';

const AUTH_NAME_PATTERNS = [
  /(^|[._-])sid($|[._-])/i,
  /session/i,
  /auth/i,
  /identity/i,
  /login/i,
  /remember/i,
  /refresh/i,
  /(^|[._-])token($|[._-])/i,
  /access[._-]?token/i,
  /id[._-]?token/i,
  /(^|[._-])jwt($|[._-])/i
];

const CSRF_NAME_PATTERNS = [/csrf/i, /xsrf/i];

export type CookieClassification = {
  likelySession: boolean;
  reasons: string[];
};

export function classifyCookie(cookie: RedactedCookie): CookieClassification {
  const reasons: string[] = [];
  const authLikeName = AUTH_NAME_PATTERNS.some((pattern) => pattern.test(cookie.name));
  const csrfStyleName = CSRF_NAME_PATTERNS.some((pattern) => pattern.test(cookie.name));

  if (csrfStyleName) {
    reasons.push('csrf-style cookie name is not enough by itself');
  }

  if (!authLikeName || csrfStyleName) {
    return { likelySession: false, reasons };
  }

  reasons.push('auth-like cookie name');

  if (cookie.httpOnly) reasons.push('HttpOnly auth-like cookie');
  if (cookie.secure) reasons.push('Secure auth-like cookie');
  if (!cookie.session && cookie.expirationDate !== undefined) reasons.push('persistent auth-like cookie');
  if (cookie.partitioned) reasons.push('partitioned auth-like cookie');

  return {
    likelySession: true,
    reasons
  };
}
