import type { SiteRisk } from './types';

export type RiskInput = {
  siteKey: string;
  cookieCount: number;
  likelySessionCookieCount: number;
  httpOnlySessionCookieCount: number;
  secureSessionCookieCount: number;
  persistentSessionCookieCount: number;
  openTabCount: number;
  hasKnownProviderAction: boolean;
  highValueProvider: boolean;
};

export type RiskResult = {
  risk: SiteRisk;
  reasons: string[];
};

export function scoreSiteRisk(input: RiskInput): RiskResult {
  const reasons = buildReasons(input);
  const risk = determineRisk(input);

  return { risk, reasons };
}

function buildReasons(input: RiskInput): string[] {
  const reasons: string[] = [];

  if (input.highValueProvider) reasons.push('known high-value provider');
  if (input.likelySessionCookieCount > 0) reasons.push('likely session/auth cookies present');
  if (input.httpOnlySessionCookieCount > 0) reasons.push('HttpOnly session indicators present');
  if (input.secureSessionCookieCount > 0) reasons.push('Secure session indicators present');
  if (input.persistentSessionCookieCount > 0) reasons.push('persistent session indicators present');
  if (input.openTabCount > 0) reasons.push('site is currently open and may recreate local state');
  if (input.hasKnownProviderAction) reasons.push('provider session-management action available');
  if (input.cookieCount > 0 && input.likelySessionCookieCount === 0) {
    reasons.push('local cookies present, but no strong session-cookie name match');
  }

  return reasons;
}

function determineRisk(input: RiskInput): SiteRisk {
  if (input.likelySessionCookieCount > 0 && input.highValueProvider) return 'critical';
  if (input.likelySessionCookieCount >= 2 && input.hasKnownProviderAction) return 'critical';
  if (input.likelySessionCookieCount > 0) return 'high';
  if (input.openTabCount > 0 || input.hasKnownProviderAction || input.highValueProvider) return 'medium';

  return 'low';
}
