import { describe, expect, it } from 'vitest';
import type { SiteInventory } from './types';
import { buildResponseChecklist } from './responseChecklist';

const inventory: SiteInventory[] = [{
  siteKey: 'github.com',
  domains: ['.github.com'],
  cookieCount: 2,
  likelySessionCookieCount: 1,
  likelySessionCookieNames: ['sessionid'],
  openTabCount: 0,
  risk: 'critical',
  reasons: ['likely session/auth cookies present'],
  providerAction: {
    label: 'Review GitHub sessions',
    url: 'https://github.com/settings/security',
    instructions: 'Review active sessions and tokens.'
  }
}];

describe('buildResponseChecklist', () => {
  it('exports a redacted prioritized checklist with cleanup limitations', () => {
    const checklist = buildResponseChecklist(inventory);

    expect(checklist).toContain('github.com');
    expect(checklist).toContain('Revoke active sessions');
    expect(checklist).toContain('https://github.com/settings/security');
    expect(checklist).toContain('does not revoke already stolen cookies');
    expect(checklist).toContain('sessionid');
    expect(checklist).not.toContain('cookie-value');
    expect(checklist).not.toContain('cookie value:');
  });

  it('omits cookie names in privacy-minimal mode', () => {
    const checklist = buildResponseChecklist(inventory, { privacyMinimal: true });

    expect(checklist).toContain('Likely session/auth cookie count: 1');
    expect(checklist).not.toContain('sessionid');
  });
});
