import type { OpenTabSummary, RedactedCookie, SiteInventory } from '../core/types';
import { getLatestSnapshot, markSiteReviewed, saveScanSnapshot, type ScanSnapshot } from '../storage/snapshotStore';
import { defaultChromeApi, type ChromeApi } from './chromeApi';
import { clearLocalSiteData, type LocalCleanupRequest, type LocalCleanupResult } from './chromeCleanup';
import { collectRedactedCookies } from './chromeCookies';
import { collectOpenTabContexts } from './chromeTabs';

type RuntimeRequest =
  | { type: 'scan' }
  | { type: 'getLatestSnapshot' }
  | { type: 'markReviewed'; siteKey: string }
  | ({ type: 'clearLocalSiteData' } & LocalCleanupRequest);

type RuntimeResponse =
  | { ok: true; snapshot?: ScanSnapshot; result?: LocalCleanupResult }
  | { ok: false; error: string };

type RouterDependencies = {
  chromeApi: ChromeApi;
  collectCookies?: (chromeApi: ChromeApi) => Promise<RedactedCookie[] | undefined>;
  collectTabs?: (chromeApi: ChromeApi) => Promise<OpenTabSummary[] | undefined>;
  buildInventory?: (cookies: RedactedCookie[], tabs: OpenTabSummary[]) => SiteInventory[] | undefined | Promise<SiteInventory[] | undefined>;
  clearLocalSiteData?: (request: LocalCleanupRequest, chromeApi: ChromeApi) => Promise<LocalCleanupResult>;
};

export function initServiceWorker(dependencies: RouterDependencies = { chromeApi: defaultChromeApi() }): void {
  const { chromeApi } = dependencies;
  const router = createServiceWorkerRouter(dependencies);

  chromeApi.action.onClicked.addListener(() => {
    chromeApi.tabs.create({ url: chromeApi.runtime.getURL('dashboard.html') });
  });

  chromeApi.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    void router(message).then(sendResponse);
    return true;
  });
}

export function createServiceWorkerRouter(dependencies: RouterDependencies) {
  const {
    chromeApi,
    collectCookies = collectRedactedCookies,
    collectTabs = collectOpenTabContexts,
    buildInventory: buildInventoryFromInputs = defaultBuildInventory,
    clearLocalSiteData: clearSiteData = clearLocalSiteData
  } = dependencies;

  return async function route(message: unknown): Promise<RuntimeResponse> {
    try {
      const request = parseRuntimeRequest(message);

      switch (request.type) {
        case 'scan': {
          const cookies = (await collectCookies(chromeApi)) ?? [];
          const tabs = (await collectTabs(chromeApi)) ?? [];
          const inventory = (await buildInventoryFromInputs(cookies, tabs)) ?? [];
          const snapshot = await saveScanSnapshot({ inventory }, chromeApi);

          return { ok: true, snapshot };
        }
        case 'getLatestSnapshot':
          return responseWithSnapshot(await getLatestSnapshot(chromeApi));
        case 'markReviewed':
          return responseWithSnapshot(await markSiteReviewed(request.siteKey, chromeApi));
        case 'clearLocalSiteData':
          return { ok: true, result: await clearSiteData(request, chromeApi) };
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown extension error'
      };
    }
  };
}

function responseWithSnapshot(snapshot: ScanSnapshot | undefined): RuntimeResponse {
  return snapshot === undefined ? { ok: true } : { ok: true, snapshot };
}

async function defaultBuildInventory(
  cookies: RedactedCookie[],
  tabs: OpenTabSummary[]
): Promise<SiteInventory[]> {
  const { buildInventory } = await import('../core/inventoryBuilder');
  return buildInventory(cookies, tabs);
}

function parseRuntimeRequest(message: unknown): RuntimeRequest {
  if (!isRuntimeRequest(message)) {
    throw new Error('Unsupported runtime message');
  }

  return message;
}

function isRuntimeRequest(message: unknown): message is RuntimeRequest {
  if (typeof message !== 'object' || message === null || !('type' in message)) return false;

  const type = (message as { type: unknown }).type;
  return type === 'scan'
    || type === 'getLatestSnapshot'
    || type === 'markReviewed'
    || type === 'clearLocalSiteData';
}

if (typeof globalThis.chrome !== 'undefined') {
  initServiceWorker({ chromeApi: defaultChromeApi() });
}
