import { vi } from 'vitest';
import type { ChromeApi } from '../background/chromeApi';

type Callback<T> = (value: T) => void;

export type ChromeMock = ChromeApi & {
  __listeners: {
    actionClicked: Array<() => void>;
    runtimeMessage: Array<
      (
        message: unknown,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: unknown) => void
      ) => boolean | undefined
    >;
  };
  __storage: Record<string, unknown>;
  __setLastError(message?: string): void;
};

export function createChromeMock(): ChromeMock {
  const listeners: ChromeMock['__listeners'] = {
    actionClicked: [],
    runtimeMessage: []
  };
  const storage: Record<string, unknown> = {};
  let lastError: { message: string } | undefined;

  const mock: ChromeMock = {
    __listeners: listeners,
    __storage: storage,
    __setLastError(message?: string) {
      lastError = message ? { message } : undefined;
    },
    runtime: {
      get lastError() {
        return lastError;
      },
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      onMessage: {
        addListener: vi.fn((listener: ChromeMock['__listeners']['runtimeMessage'][number]) => {
          listeners.runtimeMessage.push(listener);
        })
      }
    },
    action: {
      onClicked: {
        addListener: vi.fn((listener: () => void) => {
          listeners.actionClicked.push(listener);
        })
      }
    },
    cookies: {
      getAll: vi.fn((_details: chrome.cookies.GetAllDetails, callback: Callback<chrome.cookies.Cookie[]>) => {
        callback([]);
      })
    },
    tabs: {
      create: vi.fn((_properties: chrome.tabs.CreateProperties, callback?: Callback<chrome.tabs.Tab>) => {
        callback?.({ id: 1, index: 0, pinned: false, highlighted: false, windowId: 1, active: true, incognito: false, selected: true, discarded: false, autoDiscardable: true, groupId: -1 });
      }),
      query: vi.fn((_queryInfo: chrome.tabs.QueryInfo, callback: Callback<chrome.tabs.Tab[]>) => {
        callback([]);
      })
    },
    browsingData: {
      remove: vi.fn((_options: chrome.browsingData.RemovalOptions, _dataToRemove: chrome.browsingData.DataTypeSet, callback?: () => void) => {
        callback?.();
      })
    },
    storage: {
      local: {
        get: vi.fn((keys: string | string[] | Record<string, unknown> | null, callback: Callback<Record<string, unknown>>) => {
          if (keys === null) {
            callback({ ...storage });
            return;
          }

          if (typeof keys === 'string') {
            callback({ [keys]: storage[keys] });
            return;
          }

          if (Array.isArray(keys)) {
            callback(Object.fromEntries(keys.map((key) => [key, storage[key]])));
            return;
          }

          callback(Object.fromEntries(
            Object.entries(keys).map(([key, fallback]) => [key, storage[key] ?? fallback])
          ));
        }),
        set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
          Object.assign(storage, items);
          callback?.();
        })
      }
    }
  };

  return mock;
}

export function installChromeMock(mock = createChromeMock()): ChromeMock {
  vi.stubGlobal('chrome', mock);
  return mock;
}

export async function sendRuntimeMessage(
  mock: ChromeMock,
  message: unknown,
  sender: chrome.runtime.MessageSender = {}
): Promise<unknown> {
  const listener = mock.__listeners.runtimeMessage.at(-1);
  if (!listener) {
    throw new Error('No runtime message listener registered');
  }

  return await new Promise((resolve) => {
    listener(message, sender, resolve);
  });
}
