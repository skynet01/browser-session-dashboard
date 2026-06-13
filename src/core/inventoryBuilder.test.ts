import { describe, expect, it } from 'vitest';
import type { OpenTabSummary, RedactedCookie } from './types';
import { buildInventory } from './inventoryBuilder';
import { getKnownProviderSiteKeys, getProviderAction, getProviderCategory } from './providerDirectory';

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
      risk: 'critical',
      providerCategory: 'Developer'
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

  it('excludes cookies created after the suspected compromise date when creation metadata exists', () => {
    const inventory = buildInventory([
      {
        name: 'sessionid',
        domain: '.before.example',
        path: '/',
        hostOnly: false,
        httpOnly: true,
        secure: true,
        session: false,
        sameSite: 'lax',
        expirationDate: 1_790_000_000,
        creationDate: Date.UTC(2026, 4, 20, 12) / 1000,
        storeId: '0',
        partitioned: false
      },
      {
        name: 'sessionid',
        domain: '.after.example',
        path: '/',
        hostOnly: false,
        httpOnly: true,
        secure: true,
        session: false,
        sameSite: 'lax',
        expirationDate: 1_790_000_000,
        creationDate: Date.UTC(2026, 4, 21, 0) / 1000,
        storeId: '0',
        partitioned: false
      }
    ], [], { suspectedCompromiseDate: '2026-05-20' });

    expect(inventory.map((site) => site.siteKey)).toContain('before.example');
    expect(inventory.map((site) => site.siteKey)).not.toContain('after.example');
  });

  it('includes required provider response links', () => {
    expect(getKnownProviderSiteKeys()).toEqual(expect.arrayContaining([
      'google.com',
      'microsoft.com',
      'microsoftonline.com',
      'live.com',
      'outlook.com',
      'apple.com',
      'amazon.com',
      'github.com',
      'paypal.com',
      'ebay.com',
      'netflix.com',
      'reddit.com',
      'yahoo.com',
      'facebook.com',
      'instagram.com',
      'x.com',
      'twitter.com',
      'linkedin.com',
      'dropbox.com',
      'slack.com',
      'discord.com',
      'telegram.org',
      'whatsapp.com',
      'steamcommunity.com',
      'steampowered.com',
      'twitch.tv',
      'spotify.com',
      'notion.so',
      'figma.com',
      'atlassian.net',
      'zoom.us'
    ]));

    expect(getProviderAction('google.com')?.url).toContain('myaccount.google.com');
    expect(getProviderAction('github.com')?.url).toContain('github.com/settings/security');
    expect(getProviderAction('microsoftonline.com')?.url).toContain('mysignins.microsoft.com');
    expect(getProviderAction('live.com')?.url).toContain('account.live.com/Activity');
    expect(getProviderAction('paypal.com')?.url).toContain('paypal.com/myaccount/security');
    expect(getProviderAction('ebay.com')?.url).toContain('signin.ebay.com');
    expect(getProviderAction('netflix.com')?.url).toContain('ManageDevices');
    expect(getProviderAction('telegram.org')?.url).toContain('web.telegram.org');
    expect(getProviderAction('whatsapp.com')?.url).toContain('web.whatsapp.com');
    expect(getProviderAction('steamcommunity.com')?.url).toContain('steamcommunity.com');
    expect(getProviderAction('steampowered.com')?.url).toContain('steamcommunity.com');
    expect(getProviderCategory('discord.com')).toBe('Messaging');
    expect(getProviderCategory('telegram.org')).toBe('Messaging');
    expect(getProviderCategory('whatsapp.com')).toBe('Messaging');
    expect(getProviderCategory('steamcommunity.com')).toBe('Gaming');
  });

  it('includes finance and banking provider response links', () => {
    expect(getKnownProviderSiteKeys()).toEqual(expect.arrayContaining([
      'wealthfront.com',
      'betterment.com',
      'fundrise.com',
      'mercury.com',
      'stripe.com',
      'raisin.com',
      'm1.com',
      'm1finance.com',
      'chase.com',
      'bankofamerica.com',
      'wellsfargo.com',
      'capitalone.com',
      'citi.com',
      'usbank.com',
      'ally.com',
      'sofi.com',
      'schwab.com',
      'fidelity.com',
      'vanguard.com',
      'robinhood.com',
      'etrade.com'
    ]));

    expect(getProviderCategory('wealthfront.com')).toBe('Finance');
    expect(getProviderCategory('stripe.com')).toBe('Finance');
    expect(getProviderCategory('chase.com')).toBe('Finance');
    expect(getProviderAction('wealthfront.com')?.url).toContain('wealthfront.com');
    expect(getProviderAction('betterment.com')?.url).toContain('betterment.com');
    expect(getProviderAction('fundrise.com')?.url).toContain('fundrise.com');
    expect(getProviderAction('mercury.com')?.url).toContain('mercury.com');
    expect(getProviderAction('stripe.com')?.url).toContain('dashboard.stripe.com');
    expect(getProviderAction('raisin.com')?.url).toContain('raisin.com');
    expect(getProviderAction('m1.com')?.url).toContain('m1.com');
    expect(getProviderAction('m1finance.com')?.url).toContain('m1.com');
    expect(getProviderAction('bankofamerica.com')?.url).toContain('bankofamerica.com');
    expect(getProviderAction('wellsfargo.com')?.url).toContain('wellsfargo.com');
  });

  it('exposes sorted unique fingerprints for likely session cookies only', () => {
    const inventory = buildInventory(cookies, tabs);
    const github = inventory.find((site) => site.siteKey === 'github.com');
    const example = inventory.find((site) => site.siteKey === 'example.co.uk');

    expect(github?.likelySessionCookieFingerprints)
      .toEqual(['sessionid|.github.com|/|0|1790000000']);
    expect(example?.likelySessionCookieFingerprints).toBeUndefined();
  });

  it('raises audited auth-cookie misses into likely-session inventory risk', () => {
    const inventory = buildInventory([
      {
        name: '.AspNetCore.Cookies',
        domain: '.example.com',
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
        name: '__Secure-1PSID',
        domain: '.google.com',
        path: '/',
        hostOnly: false,
        httpOnly: true,
        secure: true,
        session: false,
        sameSite: 'lax',
        expirationDate: 1_790_000_000,
        storeId: '0',
        partitioned: false
      }
    ], []);

    expect(inventory.find((site) => site.siteKey === 'example.com')).toMatchObject({
      likelySessionCookieCount: 1,
      risk: 'high'
    });
    expect(inventory.find((site) => site.siteKey === 'google.com')).toMatchObject({
      likelySessionCookieCount: 1,
      risk: 'critical'
    });
  });
});
