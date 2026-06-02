import { describe, expect, it } from 'vitest';
import type { OpenTabSummary, RedactedCookie } from './types';
import { buildInventory } from './inventoryBuilder';
import { getKnownProviderSiteKeys, getProviderAction } from './providerDirectory';

const cookies: RedactedCookie[] = [
  {
    name: 'sessionid',
    domain: '.github.com',
    path: '/',
    hostOnly: false,
    httpOnly: true,
    secure: true,
    session: false,
    sameSite: 'lax',
    expirationDate: 1_790_000_000,
    storeId: '0',
    partitioned: false
  },
  {
    name: 'theme',
    domain: 'docs.github.com',
    path: '/',
    hostOnly: true,
    httpOnly: false,
    secure: true,
    session: false,
    sameSite: 'lax',
    storeId: '0',
    partitioned: false
  },
  {
    name: 'csrf_token',
    domain: '.example.co.uk',
    path: '/',
    hostOnly: false,
    httpOnly: false,
    secure: true,
    session: true,
    sameSite: 'strict',
    storeId: '0',
    partitioned: false
  }
];

const tabs: OpenTabSummary[] = [
  { id: 1, url: 'https://github.com/settings/security', title: 'GitHub' },
  { id: 2, url: 'chrome://extensions' },
  { id: 3, url: 'https://admin.example.co.uk/panel' }
];

describe('buildInventory', () => {
  it('groups cookies and http tabs by site key', () => {
    const inventory = buildInventory(cookies, tabs);
    const github = inventory.find((site) => site.siteKey === 'github.com');
    const example = inventory.find((site) => site.siteKey === 'example.co.uk');

    expect(github).toMatchObject({
      siteKey: 'github.com',
      domains: ['.github.com', 'docs.github.com'],
      cookieCount: 2,
      likelySessionCookieCount: 1,
      openTabCount: 1,
      risk: 'critical'
    });
    expect(github?.providerAction?.url).toContain('github.com');

    expect(example).toMatchObject({
      siteKey: 'example.co.uk',
      cookieCount: 1,
      likelySessionCookieCount: 0,
      openTabCount: 1,
      risk: 'medium'
    });
  });

  it('does not leak cookie values in serialized output', () => {
    const serialized = JSON.stringify(buildInventory(cookies, tabs));

    expect(serialized).not.toContain('cookie-value');
    expect(serialized).not.toContain('"value"');
  });

  it('includes required provider response links', () => {
    expect(getKnownProviderSiteKeys()).toEqual(expect.arrayContaining([
      'google.com',
      'microsoft.com',
      'apple.com',
      'amazon.com',
      'github.com',
      'facebook.com',
      'instagram.com',
      'x.com',
      'twitter.com',
      'linkedin.com',
      'dropbox.com',
      'slack.com',
      'discord.com'
    ]));

    expect(getProviderAction('google.com')?.url).toContain('myaccount.google.com');
    expect(getProviderAction('github.com')?.url).toContain('github.com/settings/security');
  });
});
