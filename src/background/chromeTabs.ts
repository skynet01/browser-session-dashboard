import type { OpenTabSummary } from '../core/types';
import { chromeError, defaultChromeApi, type ChromeApi } from './chromeApi';

export async function collectOpenTabContexts(
  chromeApi: ChromeApi = defaultChromeApi()
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
