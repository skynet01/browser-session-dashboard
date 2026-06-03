import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ScanSnapshot } from '../storage/snapshotStore';

const snapshot: ScanSnapshot = {
  id: 'scan-1',
  scannedAt: '2026-06-02T20:00:00.000Z',
  suspectedCompromiseDate: '2026-05-20',
  reviewedSiteKeys: [],
  inventory: [
    {
      siteKey: 'github.com',
      domains: ['.github.com', 'docs.github.com'],
      cookieCount: 2,
      likelySessionCookieCount: 1,
      likelySessionCookieNames: ['user_session'],
      openTabCount: 1,
      risk: 'critical',
      providerCategory: 'Developer',
      reasons: ['known high-value provider', 'likely session/auth cookies present'],
      providerAction: {
        label: 'Review GitHub session page',
        url: 'https://github.com/settings/security',
        instructions: 'Review sessions and tokens.'
      }
    },
    {
      siteKey: 'example.com',
      domains: ['example.com'],
      cookieCount: 1,
      likelySessionCookieCount: 0,
      openTabCount: 0,
      risk: 'low',
      reasons: ['local cookies present, but no strong session-cookie name match']
    }
  ]
};

describe('dashboard', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    document.body.innerHTML = '<main id="app" class="dashboard-shell"></main>';
  });

  test('scans and renders prioritized redacted inventory with cleanup boundary copy', async () => {
    installRuntimeMock([{ ok: true }, { ok: true, snapshot }]);

    await import('./dashboard');
    document.querySelector<HTMLInputElement>('[data-control="suspected-date"]')!.value = '2026-05-20';
    document.querySelector<HTMLInputElement>('[data-control="suspected-date"]')!
      .dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector<HTMLButtonElement>('[data-action="scan"]')?.click();
    await waitForAsyncUi();

    const text = normalizedText();

    expect(text).toContain('2 sites');
    expect(text).toContain('github.com');
    expect(text).toContain('critical');
    expect(text).toContain('Developer');
    expect(text).toContain('Known high-value provider');
    expect(text).toContain('Review GitHub session page');
    expect(text).toContain('Open example.com login');
    expect(text).toContain('Mark done');
    expect(text).not.toContain('Mark reviewed');
    expect(text).not.toContain('Export checklist');
    expect(document.querySelector('[data-action="export"]')).toBeNull();
    expect(text).toContain('Response date May 20, 2026');
    expect(text).toContain('Cookies with known creation dates after that date are hidden');
    expect(text).toContain('Local cleanup does not revoke stolen cookies.');
    expect(text).not.toContain('secret-cookie-value');
    expect(text).not.toContain('cookie value:');

    const githubRow = document.querySelector<HTMLElement>('[data-site-row="github.com"]');
    expect(githubRow?.querySelector('.row-actions--right')).not.toBeNull();
    expect(document.querySelector<HTMLAnchorElement>('[data-action="login"][data-site="example.com"]')?.href)
      .toBe('https://example.com/login');
  });

  test('loads the latest saved scan on startup', async () => {
    const sendMessage = installRuntimeMock([{ ok: true, snapshot }]);

    await import('./dashboard');
    await waitForAsyncUi();

    expect(sendMessage).toHaveBeenCalledWith({ type: 'getLatestSnapshot' });
    expect(normalizedText()).toContain('github.com');
    expect(normalizedText()).toContain('Response Log Loaded saved scan from Jun 2, 01:00 PM');
  });

  test('sends the suspected compromise date with scans', async () => {
    const sendMessage = installRuntimeMock([{ ok: true }, { ok: true, snapshot }]);

    await import('./dashboard');
    document.querySelector<HTMLInputElement>('[data-control="suspected-date"]')!.value = '2026-05-20';
    document.querySelector<HTMLInputElement>('[data-control="suspected-date"]')!
      .dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector<HTMLButtonElement>('[data-action="scan"]')?.click();
    await waitForAsyncUi();

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'scan',
      suspectedCompromiseDate: '2026-05-20'
    });
  });

  test('filters inventory by severity and domain search', async () => {
    installRuntimeMock([{ ok: true }, { ok: true, snapshot }]);

    await import('./dashboard');
    document.querySelector<HTMLButtonElement>('[data-action="scan"]')?.click();
    await waitForAsyncUi();

    document.querySelector<HTMLSelectElement>('[data-control="severity"]')!.value = 'critical';
    document.querySelector<HTMLSelectElement>('[data-control="severity"]')!
      .dispatchEvent(new Event('change', { bubbles: true }));

    expect(normalizedText()).toContain('github.com');
    expect(normalizedText()).not.toContain('example.com');

    document.querySelector<HTMLInputElement>('[data-control="search"]')!.value = 'example';
    document.querySelector<HTMLInputElement>('[data-control="search"]')!
      .dispatchEvent(new Event('input', { bubbles: true }));

    expect(normalizedText()).toContain('No sites match');
  });

  test('requires confirmation before local cleanup and removes cleared sites from the dashboard', async () => {
    const sendMessage = installRuntimeMock([
      { ok: true },
      { ok: true, snapshot },
      {
        ok: true,
        result: {
          siteKey: 'github.com',
          status: 'completed',
          warning: 'Local cleanup logs out this browser profile, but it does not revoke already stolen cookies.'
      }
      }
    ]);
    vi.stubGlobal('confirm', vi.fn(() => true));

    await import('./dashboard');
    document.querySelector<HTMLButtonElement>('[data-action="scan"]')?.click();
    await waitForAsyncUi();

    document.querySelector<HTMLButtonElement>('[data-action="clear"][data-site="github.com"]')?.click();
    await waitForAsyncUi();

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('does not revoke stolen cookies'));
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'clearLocalSiteData',
      siteKey: 'github.com'
    }));
    expect(document.querySelector<HTMLElement>('[data-site-row="github.com"]')).toBeNull();
    expect(normalizedText()).toContain('example.com');
  });

  test('records reviewed sites and turns completed rows green', async () => {
    installRuntimeMock([
      { ok: true },
      { ok: true, snapshot },
      { ok: true, snapshot: { ...snapshot, reviewedSiteKeys: ['github.com'] } }
    ]);

    await import('./dashboard');
    document.querySelector<HTMLButtonElement>('[data-action="scan"]')?.click();
    await waitForAsyncUi();

    document.querySelector<HTMLButtonElement>('[data-action="review"][data-site="github.com"]')?.click();
    await waitForAsyncUi();

    expect(normalizedText()).toContain('Reviewed');
    expect(document.querySelector<HTMLElement>('[data-site-row="github.com"]')?.classList.contains('is-reviewed')).toBe(true);
  });

});

function installRuntimeMock(responses: unknown[]) {
  const sendMessage = vi.fn(async () => {
    const response = responses.shift();
    if (response === undefined) throw new Error('Unexpected runtime message');

    return response;
  });

  vi.stubGlobal('chrome', {
    runtime: { sendMessage }
  });

  return sendMessage;
}

async function waitForAsyncUi(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function normalizedText(): string {
  return document.body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}
