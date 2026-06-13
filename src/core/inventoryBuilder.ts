import { cookieFingerprint } from './cookieFingerprint';
import { getProviderAction, getProviderCategory, isHighValueProvider } from './providerDirectory';
import { scoreSiteRisk } from './riskScoring';
import { classifyCookie } from './sessionClassifier';
import { getSiteKey } from './siteKey';
import type { OpenTabSummary, RedactedCookie, SiteInventory, SiteRisk } from './types';

type SiteGroup = {
  cookies: RedactedCookie[];
  tabs: OpenTabSummary[];
};

export type InventoryBuildOptions = {
  suspectedCompromiseDate?: string;
};

export function buildInventory(
  cookies: RedactedCookie[],
  tabs: OpenTabSummary[],
  options: InventoryBuildOptions = {}
): SiteInventory[] {
  const bySite = new Map<string, SiteGroup>();
  const filteredCookies = filterCookiesBySuspectedDate(cookies, options.suspectedCompromiseDate);

  for (const cookie of filteredCookies) {
    groupFor(bySite, getSiteKey(cookie.domain)).cookies.push(cookie);
  }

  for (const tab of tabs) {
    const siteKey = siteKeyFromTab(tab);
    if (!siteKey) continue;

    groupFor(bySite, siteKey).tabs.push(tab);
  }

  return [...bySite.entries()]
    .map(([siteKey, group]) => buildSiteInventory(siteKey, group))
    .sort(sortByRiskThenName);
}

function filterCookiesBySuspectedDate(
  cookies: RedactedCookie[],
  suspectedCompromiseDate: string | undefined
): RedactedCookie[] {
  const endOfDate = endOfDateSeconds(suspectedCompromiseDate);
  if (endOfDate === undefined) return cookies;

  return cookies.filter((cookie) => cookie.creationDate === undefined || cookie.creationDate <= endOfDate);
}

function endOfDateSeconds(value: string | undefined): number | undefined {
  if (!value) return undefined;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;

  const [, year, month, day] = match.map(Number);
  if (!year || !month || !day) return undefined;

  return Date.UTC(year, month - 1, day, 23, 59, 59, 999) / 1000;
}

function buildSiteInventory(siteKey: string, group: SiteGroup): SiteInventory {
  const classifications = group.cookies.map((cookie) => ({
    cookie,
    classification: classifyCookie(cookie)
  }));
  const likelySessionCookies = classifications
    .filter(({ classification }) => classification.likelySession)
    .map(({ cookie }) => cookie);
  const providerAction = getProviderAction(siteKey);
  const providerCategory = getProviderCategory(siteKey);
  const riskResult = scoreSiteRisk({
    siteKey,
    cookieCount: group.cookies.length,
    likelySessionCookieCount: likelySessionCookies.length,
    httpOnlySessionCookieCount: likelySessionCookies.filter((cookie) => cookie.httpOnly).length,
    secureSessionCookieCount: likelySessionCookies.filter((cookie) => cookie.secure).length,
    persistentSessionCookieCount: likelySessionCookies.filter((cookie) => !cookie.session && cookie.expirationDate !== undefined).length,
    openTabCount: group.tabs.length,
    hasKnownProviderAction: providerAction !== undefined,
    highValueProvider: isHighValueProvider(siteKey)
  });
  const inventory: SiteInventory = {
    siteKey,
    domains: [...new Set(group.cookies.map((cookie) => cookie.domain))].sort(),
    cookieCount: group.cookies.length,
    likelySessionCookieCount: likelySessionCookies.length,
    openTabCount: group.tabs.length,
    risk: riskResult.risk,
    reasons: [...new Set([
      ...riskResult.reasons,
      ...classifications.flatMap(({ classification }) => classification.reasons)
    ])]
  };
  const likelySessionCookieNames = [...new Set(likelySessionCookies.map((cookie) => cookie.name))].sort();
  const likelySessionCookieFingerprints = [...new Set(likelySessionCookies.map(cookieFingerprint))].sort();

  if (likelySessionCookieNames.length > 0) inventory.likelySessionCookieNames = likelySessionCookieNames;
  if (likelySessionCookieFingerprints.length > 0) inventory.likelySessionCookieFingerprints = likelySessionCookieFingerprints;
  if (providerAction !== undefined) inventory.providerAction = providerAction;
  if (providerCategory !== undefined) inventory.providerCategory = providerCategory;

  return inventory;
}

function groupFor(bySite: Map<string, SiteGroup>, siteKey: string): SiteGroup {
  const existing = bySite.get(siteKey);
  if (existing) return existing;

  const created: SiteGroup = { cookies: [], tabs: [] };
  bySite.set(siteKey, created);
  return created;
}

function siteKeyFromTab(tab: OpenTabSummary): string | undefined {
  try {
    const url = new URL(tab.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;

    return getSiteKey(url.hostname);
  } catch {
    return undefined;
  }
}

function sortByRiskThenName(a: SiteInventory, b: SiteInventory): number {
  return riskRank(b.risk) - riskRank(a.risk) || a.siteKey.localeCompare(b.siteKey);
}

function riskRank(risk: SiteRisk): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[risk];
}
