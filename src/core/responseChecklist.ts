import type { SiteInventory } from './types';

export type ResponseChecklistOptions = {
  privacyMinimal?: boolean;
  suspectedCompromiseDate?: string;
};

export function buildResponseChecklist(
  inventory: SiteInventory[],
  options: ResponseChecklistOptions = {}
): string {
  const lines = [
    '# Browser Session Compromise Response Checklist',
    '',
    'This export is redacted. It includes local cookie metadata only and never includes cookie values.',
    'Local cleanup logs out this browser profile, but it does not revoke already stolen cookies or server-side sessions.',
    'Treat these entries as likely exposure indicators, not proof that any specific session was stolen.',
    ...responseWindowLines(options),
    ''
  ];

  for (const site of [...inventory].sort(sortForChecklist)) {
    lines.push(...siteLines(site, options), '');
  }

  return lines.join('\n').trimEnd();
}

function responseWindowLines(options: ResponseChecklistOptions): string[] {
  if (!options.suspectedCompromiseDate) return [];

  return [
    `Suspected compromise date: ${options.suspectedCompromiseDate}`,
    'Date-based scans reflect current browser state, not historical proof that cookies existed on the suspected compromise date.'
  ];
}

function siteLines(site: SiteInventory, options: ResponseChecklistOptions): string[] {
  const lines = [
    `## ${site.siteKey}`,
    `Risk: ${site.risk}`,
    `Domains observed: ${site.domains.length > 0 ? site.domains.join(', ') : 'none'}`,
    `Cookie count: ${site.cookieCount}`,
    `Likely session/auth cookie count: ${site.likelySessionCookieCount}`,
    `Open tab count: ${site.openTabCount}`
  ];

  if (!options.privacyMinimal && site.likelySessionCookieNames && site.likelySessionCookieNames.length > 0) {
    lines.push(`Likely session/auth cookie names: ${site.likelySessionCookieNames.join(', ')}`);
  }

  if (site.providerAction) {
    lines.push(
      `Provider action: ${site.providerAction.label}`,
      `Provider URL: ${site.providerAction.url}`,
      `Provider guidance: ${site.providerAction.instructions}`
    );
  }

  if (site.reasons.length > 0) {
    lines.push(`Reasons: ${site.reasons.join('; ')}`);
  }

  lines.push(
    '- Revoke active sessions from the provider security page when available.',
    '- Change password if session revocation is unavailable or account activity looks suspicious.',
    '- Review MFA, passkeys, API tokens, OAuth apps, recovery email, and backup codes.',
    '- Clear local browser cookies and site data after remote revocation is complete.'
  );

  return lines;
}

function sortForChecklist(a: SiteInventory, b: SiteInventory): number {
  return riskRank(b.risk) - riskRank(a.risk) || a.siteKey.localeCompare(b.siteKey);
}

function riskRank(risk: SiteInventory['risk']): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[risk];
}
