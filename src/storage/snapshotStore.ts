import type { SiteInventory } from '../core/types';

type ChromeApi = {
  runtime: { readonly lastError: { message?: string | undefined } | undefined };
  storage: {
    local: {
      get(key: string, callback: (items: Record<string, unknown>) => void): void;
      set(items: Record<string, unknown>, callback?: () => void): void;
    };
  };
};

const LATEST_SNAPSHOT_KEY = 'latestScanSnapshot';
const SNAPSHOT_HISTORY_KEY = 'scanSnapshots';
const MAX_HISTORY = 10;

export type ScanSnapshotInput = {
  inventory: Array<SiteInventory & Record<string, unknown>>;
  reviewedSiteKeys?: string[];
  [key: string]: unknown;
};

export type ScanSnapshot = {
  id: string;
  scannedAt: string;
  inventory: SiteInventory[];
  reviewedSiteKeys: string[];
};

export async function saveScanSnapshot(
  input: ScanSnapshotInput,
  chromeApi: ChromeApi = chrome
): Promise<ScanSnapshot> {
  const snapshot: ScanSnapshot = {
    id: `scan-${Date.now()}`,
    scannedAt: new Date().toISOString(),
    inventory: sanitizeInventory(input.inventory),
    reviewedSiteKeys: [...new Set(input.reviewedSiteKeys ?? [])].sort()
  };

  const history = await getSnapshotHistory(chromeApi);

  await storageSet({
    [LATEST_SNAPSHOT_KEY]: snapshot,
    [SNAPSHOT_HISTORY_KEY]: [snapshot, ...history].slice(0, MAX_HISTORY)
  }, chromeApi);

  return snapshot;
}

export async function getLatestSnapshot(
  chromeApi: ChromeApi = chrome
): Promise<ScanSnapshot | undefined> {
  const result = await storageGet(LATEST_SNAPSHOT_KEY, chromeApi);
  const snapshot = result[LATEST_SNAPSHOT_KEY];

  return isScanSnapshot(snapshot) ? snapshot : undefined;
}

export async function markSiteReviewed(
  siteKey: string,
  chromeApi: ChromeApi = chrome
): Promise<ScanSnapshot | undefined> {
  const latest = await getLatestSnapshot(chromeApi);
  if (!latest) return undefined;

  const snapshot: ScanSnapshot = {
    ...latest,
    reviewedSiteKeys: [...new Set([...latest.reviewedSiteKeys, siteKey])].sort()
  };
  const history = await getSnapshotHistory(chromeApi);

  await storageSet({
    [LATEST_SNAPSHOT_KEY]: snapshot,
    [SNAPSHOT_HISTORY_KEY]: [snapshot, ...history.filter((item) => item.id !== snapshot.id)].slice(0, MAX_HISTORY)
  }, chromeApi);

  return snapshot;
}

async function getSnapshotHistory(chromeApi: ChromeApi): Promise<ScanSnapshot[]> {
  const result = await storageGet(SNAPSHOT_HISTORY_KEY, chromeApi);
  const history = result[SNAPSHOT_HISTORY_KEY];

  return Array.isArray(history) ? history.filter(isScanSnapshot) : [];
}

function sanitizeInventory(inventory: SiteInventory[]): SiteInventory[] {
  return JSON.parse(JSON.stringify(inventory, omitCookieValues)) as SiteInventory[];
}

function omitCookieValues(key: string, value: unknown): unknown {
  if (key === 'value') return undefined;

  return value;
}

async function storageGet(
  key: string,
  chromeApi: ChromeApi
): Promise<Record<string, unknown>> {
  return await new Promise((resolve, reject) => {
    chromeApi.storage.local.get(key, (result) => {
      const error = chromeError(chromeApi);
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });
  });
}

async function storageSet(
  items: Record<string, unknown>,
  chromeApi: ChromeApi
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    chromeApi.storage.local.set(items, () => {
      const error = chromeError(chromeApi);
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function isScanSnapshot(value: unknown): value is ScanSnapshot {
  return typeof value === 'object' && value !== null && 'id' in value && 'inventory' in value;
}

function chromeError(chromeApi: ChromeApi): Error | undefined {
  const message = chromeApi.runtime.lastError?.message;
  return message ? new Error(message) : undefined;
}
