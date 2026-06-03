import { describe, expect, it } from 'vitest';
import type { RedactedCookie } from './types';
import { classifyCookie } from './sessionClassifier';

const baseCookie: RedactedCookie = {
  name: 'theme',
  domain: '.example.com',
  path: '/',
  hostOnly: false,
  httpOnly: false,
  secure: true,
  session: false,
  sameSite: 'lax',
  storeId: '0',
  partitioned: false
};

describe('classifyCookie', () => {
  it.each(['session', 'sessionid', 'sid', 'auth', 'id_token', 'jwt', 'remember_me', 'refresh_token'])(
    'flags %s as a likely session/auth cookie',
    (name) => {
      expect(classifyCookie({ ...baseCookie, name, httpOnly: true }).likelySession).toBe(true);
    }
  );

  it.each([
    '.AspNetCore.Cookies',
    'HSID',
    'SSID',
    'APISID',
    'SAPISID',
    'SIDCC',
    '__Secure-1PSID',
    '__Secure-1PSIDCC',
    'wordpress_logged_in_abcdef'
  ])('flags common framework and identity-provider auth cookie %s', (name) => {
    expect(classifyCookie({ ...baseCookie, name, httpOnly: true }).likelySession).toBe(true);
  });

  it('does not treat csrf alone as a login session', () => {
    const result = classifyCookie({ ...baseCookie, name: 'csrf_token' });

    expect(result.likelySession).toBe(false);
    expect(result.reasons).toContain('csrf-style cookie name is not enough by itself');
  });

  it('adds metadata reasons without leaking values', () => {
    const result = classifyCookie({
      ...baseCookie,
      name: 'sid',
      httpOnly: true,
      secure: true,
      expirationDate: 1_790_000_000
    });

    expect(result.reasons).toContain('auth-like cookie name');
    expect(result.reasons).toContain('HttpOnly auth-like cookie');
    expect(result.reasons).toContain('persistent auth-like cookie');
    expect(JSON.stringify(result)).not.toContain('cookie-value');
  });
});
