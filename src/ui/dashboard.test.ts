import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ScanSnapshot } from '../storage/snapshotStore';

const snapshot: ScanSnapshot = {
  id: 'scan-1',
  scannedAt: '2026-06-02T20:00:00.000Z',
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
      reasons: ['known high-value provider', 'likely session/auth cookies present'],
      providerAction: {
        label: 'Review GitHub sessions',
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
    installRuntimeMock([{ ok: true, snapshot }]);

    await import('./dashboard');
    document.querySelector<HTMLButtonElement>('[data-action="scan"]')?.click();
    await waitForAsyncUi();

    const text = normalizedText();

    expect(text).toContain('2 sites');
    expect(text).toContain('github.com');
    expect(text).toContain('critical');
    expect(text).toContain('Known high-value provider');
    expect(text).toContain('Local cleanup does not revoke stolen cookies.');
    expect(text).not.toContain('secret-cookie-value');
    expect(text).not.toContain('cookie value:');
  });

  test('filters inventory by severity and domain search', async () => {
    installRuntimeMock([{ ok: true, snapshot }]);

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

  test('requires confirmation before local cleanup and records reviewed sites', async () => {
    const sendMessage = installRuntimeMock([
      { ok: true, snapshot },
      {
        ok: true,
        result: {
          siteKey: 'github.com',
          status: 'completed',
          warning: 'Local cleanup logs out this browser profile, but it does not revoke already stolen cookies.'
        }
      },
      { ok: true, snapshot: { ...snapshot, reviewedSiteKeys: ['github.com'] } }
    ]);
    vi.stubGlobal('confirm', vi.fn(() => true));

    await import('./dashboard');
    document.querySelector<HTMLButtonElement>('[data-action="scan"]')?.click();
    await waitForAsyncUi();

    document.querySelector<HTMLButtonElement>('[data-action="clear"][data-site="github.com"]')?.click();
    await waitForAsyncUi();
    document.querySelector<HTMLButtonElement>('[data-action="review"][data-site="github.com"]')?.click();
    await waitForAsyncUi();

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('does not revoke stolen cookies'));
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'clearLocalSiteData',
      siteKey: 'github.com'
    }));
    expect(normalizedText()).toContain('Reviewed');
  });

  test('exports a privacy-minimal redacted checklist', async () => {
    installRuntimeMock([{ ok: true, snapshot }]);
    const createObjectURL = vi.fn((blob: Blob) => {
      expect(blob).toBeInstanceOf(Blob);
      return 'blob:checklist';
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    await import('./dashboard');
    document.querySelector<HTMLButtonElement>('[data-action="scan"]')?.click();
    await waitForAsyncUi();
    document.querySelector<HTMLButtonElement>('[data-action="export"]')?.click();

    const blob = firstBlobArgument(createObjectURL.mock.calls);
    const text = await readBlob(blob);

    expect(text).toContain('github.com');
    expect(text).toContain('does not revoke already stolen cookies');
    expect(text).toContain('Likely session/auth cookie count: 1');
    expect(text).not.toContain('user_session');
    expect(text).not.toContain('secret-cookie-value');
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

function firstBlobArgument(calls: Array<[Blob]>): Blob {
  const call = calls[0];
  if (!call) throw new Error('Expected URL.createObjectURL to be called');

  return call[0];
}

async function readBlob(blob: Blob): Promise<string> {
  const reader = new FileReader();
  return await new Promise((resolve, reject) => {
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}
