import type { OpenTabSummary } from '../core/types';

type ChromeApi = {
  runtime: { readonly lastError: { message?: string | undefined } | undefined };
  tabs: {
    query(queryInfo: chrome.tabs.QueryInfo, callback: (tabs: chrome.tabs.Tab[]) => void): void;
  };
};

export async function collectOpenTabContexts(
  chromeApi: ChromeApi = chrome
): Promise<OpenTabSummary[]> {
  return await new Promise((resolve, reject) => {
    chromeApi.tabs.query({}, (tabs) => {
      const error = chromeError(chromeApi);
      if (error) {
        reject(error);
        return;
      }

      resolve(tabs.flatMap(tabSummary));
    });
  });
}

function tabSummary(tab: chrome.tabs.Tab): OpenTabSummary[] {
  if (tab.id === undefined || !tab.url) return [];

  try {
    const url = new URL(tab.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return [];

    const summary: OpenTabSummary = {
      id: tab.id,
      url: tab.url,
      host: url.hostname,
      origin: url.origin
    };

    if (tab.windowId !== undefined) summary.windowId = tab.windowId;
    if (tab.title !== undefined) summary.title = tab.title;

    return [summary];
  } catch {
    return [];
  }
}

function chromeError(chromeApi: ChromeApi): Error | undefined {
  const message = chromeApi.runtime.lastError?.message;
  return message ? new Error(message) : undefined;
}
