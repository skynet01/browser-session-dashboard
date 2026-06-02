import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectOpenTabContexts } from './chromeTabs';
import { installChromeMock } from '../test/chromeMocks';

describe('collectOpenTabContexts', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('collects host and origin context from HTTP tabs without reading content', async () => {
    const chromeMock = installChromeMock();
    chromeMock.tabs.query = vi.fn((_queryInfo, callback) => {
      callback([
        { id: 1, windowId: 10, url: 'https://github.com/settings/security', title: 'Security', index: 0, pinned: false, highlighted: false, active: true, incognito: false, selected: true, discarded: false, autoDiscardable: true, groupId: -1 },
        { id: 2, windowId: 10, url: 'chrome://extensions', title: 'Extensions', index: 1, pinned: false, highlighted: false, active: false, incognito: false, selected: false, discarded: false, autoDiscardable: true, groupId: -1 },
        { id: 3, windowId: 10, url: 'http://localhost:5173/path', title: 'Local', index: 2, pinned: false, highlighted: false, active: false, incognito: false, selected: false, discarded: false, autoDiscardable: true, groupId: -1 }
      ]);
    });

    const tabs = await collectOpenTabContexts(chromeMock);

    expect(chromeMock.tabs.query).toHaveBeenCalledWith({}, expect.any(Function));
    expect(tabs).toEqual([
      {
        id: 1,
        windowId: 10,
        url: 'https://github.com/settings/security',
        title: 'Security',
        host: 'github.com',
        origin: 'https://github.com'
      },
      {
        id: 3,
        windowId: 10,
        url: 'http://localhost:5173/path',
        title: 'Local',
        host: 'localhost',
        origin: 'http://localhost:5173'
      }
    ]);
  });

  it('surfaces tab query errors', async () => {
    const chromeMock = installChromeMock();
    chromeMock.tabs.query = vi.fn((_queryInfo, callback) => {
      chromeMock.__setLastError('tabs API unavailable');
      callback([]);
    });

    await expect(collectOpenTabContexts(chromeMock)).rejects.toThrow('tabs API unavailable');
  });
});
