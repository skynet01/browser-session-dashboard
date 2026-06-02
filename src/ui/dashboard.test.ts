import { describe, expect, test } from 'vitest';

describe('dashboard scaffold', () => {
  test('renders the product boundary copy without cookie values', async () => {
    document.body.innerHTML = '<main id="app" class="dashboard-shell"></main>';

    await import('./dashboard');

    const text = document.body.textContent?.replace(/\s+/g, ' ') ?? '';

    expect(text).toContain("likely exposed if this browser profile's cookies were stolen");
    expect(text).not.toContain('cookie value');
  });
});
