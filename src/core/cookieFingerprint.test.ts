import { describe, expect, it } from 'vitest';
import type { RedactedCookie } from './types';
import { cookieFingerprint } from './cookieFingerprint';

function cookie(overrides: Partial<RedactedCookie> = {}): RedactedCookie {
  return {
    name: 'user_session',
    domain: '.github.com',
    path: '/',
    hostOnly: false,
    httpOnly: true,
    secure: true,
    session: false,
    sameSite: 'lax',
    storeId: '0',
    partitioned: false,
    ...overrides
  };
}

describe('cookieFingerprint', () => {
  it('fingerprints persistent cookies by identity metadata and whole-second expiry', () => {
    expect(cookieFingerprint(cookie({ expirationDate: 1_790_000_000.25 })))
      .toBe('user_session|.github.com|/|0|1790000000');
  });

  it('marks session-only cookies with a session expiry token', () => {
    expect(cookieFingerprint(cookie({ session: true })))
      .toBe('user_session|.github.com|/|0|session');
  });

  it('treats a persistent-flag cookie with no recorded expiry as session-scoped', () => {
    expect(cookieFingerprint(cookie({ session: false })))
      .toBe('user_session|.github.com|/|0|session');
  });

  it('never includes a cookie value', () => {
    const withValue: RedactedCookie & { value: string } = {
      ...cookie({ expirationDate: 1_790_000_000 }),
      value: 'secret-cookie-value'
    };
    expect(cookieFingerprint(withValue)).not.toContain('secret-cookie-value');
  });
});
