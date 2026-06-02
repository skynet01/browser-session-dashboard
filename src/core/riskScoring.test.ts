import { describe, expect, it } from 'vitest';
import { scoreSiteRisk } from './riskScoring';

describe('scoreSiteRisk', () => {
  it('scores known high-value providers with likely sessions as critical', () => {
    const result = scoreSiteRisk({
      siteKey: 'google.com',
      cookieCount: 6,
      likelySessionCookieCount: 3,
      httpOnlySessionCookieCount: 2,
      secureSessionCookieCount: 3,
      persistentSessionCookieCount: 1,
      openTabCount: 1,
      hasKnownProviderAction: true,
      highValueProvider: true
    });

    expect(result.risk).toBe('critical');
    expect(result.reasons).toEqual(expect.arrayContaining([
      'known high-value provider',
      'likely session/auth cookies present',
      'provider session-management action available'
    ]));
  });

  it('scores unknown sites with likely sessions as high', () => {
    expect(scoreSiteRisk({
      siteKey: 'example.com',
      cookieCount: 2,
      likelySessionCookieCount: 1,
      httpOnlySessionCookieCount: 0,
      secureSessionCookieCount: 1,
      persistentSessionCookieCount: 0,
      openTabCount: 0,
      hasKnownProviderAction: false,
      highValueProvider: false
    }).risk).toBe('high');
  });

  it('uses open tabs and provider action to distinguish medium from low cookie-only sites', () => {
    expect(scoreSiteRisk({
      siteKey: 'docs.example.com',
      cookieCount: 3,
      likelySessionCookieCount: 0,
      httpOnlySessionCookieCount: 0,
      secureSessionCookieCount: 0,
      persistentSessionCookieCount: 0,
      openTabCount: 1,
      hasKnownProviderAction: false,
      highValueProvider: false
    }).risk).toBe('medium');

    expect(scoreSiteRisk({
      siteKey: 'static.example.com',
      cookieCount: 1,
      likelySessionCookieCount: 0,
      httpOnlySessionCookieCount: 0,
      secureSessionCookieCount: 0,
      persistentSessionCookieCount: 0,
      openTabCount: 0,
      hasKnownProviderAction: false,
      highValueProvider: false
    }).risk).toBe('low');
  });
});
