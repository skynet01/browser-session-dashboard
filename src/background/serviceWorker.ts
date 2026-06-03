import { buildInventory as defaultBuildInventory, type InventoryBuildOptions } from '../core/inventoryBuilder';
import type { OpenTabSummary, RedactedCookie, SiteInventory } from '../core/types';
import { getLatestSnapshot, markSiteReviewed, saveScanSnapshot, type ScanSnapshot } from '../storage/snapshotStore';
import { clearLocalSiteData, type LocalCleanupRequest, type LocalCleanupResult } from './chromeCleanup';
import { collectRedactedCookies } from './chromeCookies';
import { collectOpenTabContexts } from './chromeTabs';

type ChromeApi = {
  runtime: {
    readonly lastError: { message?: string | undefined } | undefined;
    getURL(path: string): string;
    onMessage: {
      addListener(
        listener: (
          message: unknown,
          sender: chrome.runtime.MessageSender,
          sendResponse: (response?: unknown) => void
        ) => boolean | undefined
      ): void;
    };
  };
  action: { onClicked: { addListener(listener: () => void): void } };
  cookies: {
    getAll(details: chrome.cookies.GetAllDetails, callback: (cookies: chrome.cookies.Cookie[]) => void): void;
  };
  tabs: {
    create(properties: chrome.tabs.CreateProperties, callback?: (tab: chrome.tabs.Tab) => void): void;
    query(queryInfo: chrome.tabs.QueryInfo, callback: (tabs: chrome.tabs.Tab[]) => void): void;
  };
  browsingData?: {
    remove(
      options: chrome.browsingData.RemovalOptions,
      dataToRemove: chrome.browsingData.DataTypeSet,
      callback?: () => void
    ): void;
  };
  storage: {
    local: {
      get(key: string, callback: (items: Record<string, unknown>) => void): void;
      set(items: Record<string, unknown>, callback?: () => void): void;
    };
  };
};

type RuntimeRequest =
  | { type: 'scan'; suspectedCompromiseDate?: string }
  | { type: 'getCapabilities' }
  | { type: 'getLatestSnapshot' }
  | { type: 'markReviewed'; siteKey: string }
  | ({ type: 'clearLocalSiteData' } & LocalCleanupRequest);

export type ExtensionCapabilities = {
  localCleanup: boolean;
};

type RuntimeResponse =
  | { ok: true; snapshot?: ScanSnapshot; result?: LocalCleanupResult; capabilities?: ExtensionCapabilities }
  | { ok: false; error: string };

type RouterDependencies = {
  chromeApi: ChromeApi;
  collectCookies?: (chromeApi: ChromeApi) => Promise<RedactedCookie[] | undefined>;
  collectTabs?: (chromeApi: ChromeApi) => Promise<OpenTabSummary[] | undefined>;
  buildInventory?: (
    cookies: RedactedCookie[],
    tabs: OpenTabSummary[],
    options?: InventoryBuildOptions
  ) => SiteInventory[] | undefined | Promise<SiteInventory[] | undefined>;
  clearLocalSiteData?: (request: LocalCleanupRequest, chromeApi: ChromeApi) => Promise<LocalCleanupResult>;
};

export function initServiceWorker(dependencies: RouterDependencies = { chromeApi: chrome }): void {
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
          const inventory = (await buildInventoryFromInputs(cookies, tabs, {
            ...(request.suspectedCompromiseDate ? { suspectedCompromiseDate: request.suspectedCompromiseDate } : {})
          })) ?? [];
          const snapshot = await saveScanSnapshot({
            inventory,
            suspectedCompromiseDate: request.suspectedCompromiseDate
          }, chromeApi);

          return { ok: true, snapshot };
        }
        case 'getLatestSnapshot':
          return responseWithSnapshot(await getLatestSnapshot(chromeApi));
        case 'getCapabilities':
          return { ok: true, capabilities: browserCapabilities(chromeApi) };
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

function parseRuntimeRequest(message: unknown): RuntimeRequest {
  if (!isRuntimeRequest(message)) {
    throw new Error('Unsupported runtime message');
  }

  return message;
}

function isRuntimeRequest(message: unknown): message is RuntimeRequest {
  if (typeof message !== 'object' || message === null || !('type' in message)) return false;

  const type = (message as { type: unknown }).type;
  if (type === 'scan') {
    const suspectedCompromiseDate = (message as { suspectedCompromiseDate?: unknown }).suspectedCompromiseDate;
    return suspectedCompromiseDate === undefined
      || (typeof suspectedCompromiseDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(suspectedCompromiseDate));
  }

  return type === 'getLatestSnapshot'
    || type === 'getCapabilities'
    || type === 'markReviewed'
    || type === 'clearLocalSiteData';
}

function browserCapabilities(chromeApi: ChromeApi): ExtensionCapabilities {
  return {
    localCleanup: typeof chromeApi.browsingData?.remove === 'function'
  };
}

if (typeof globalThis.chrome !== 'undefined') {
  initServiceWorker({ chromeApi: globalThis.chrome });
}
