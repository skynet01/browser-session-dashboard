import type { SiteInventory } from '../core/types';
import { storageGet, storageSet, type ChromeStorageApi } from './chromeStorage';

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
  suspectedCompromiseDate?: string;
  inventory: SiteInventory[];
  reviewedSiteKeys: string[];
};

export async function saveScanSnapshot(
  input: ScanSnapshotInput,
  chromeApi: ChromeStorageApi = chrome
): Promise<ScanSnapshot> {
  const snapshot: ScanSnapshot = {
    id: `scan-${Date.now()}`,
    scannedAt: new Date().toISOString(),
    inventory: sanitizeInventory(input.inventory),
    reviewedSiteKeys: [...new Set(input.reviewedSiteKeys ?? [])].sort()
  };
  if (typeof input.suspectedCompromiseDate === 'string') {
    snapshot.suspectedCompromiseDate = input.suspectedCompromiseDate;
  }

  const history = await getSnapshotHistory(chromeApi);

  await storageSet({
    [LATEST_SNAPSHOT_KEY]: snapshot,
    [SNAPSHOT_HISTORY_KEY]: [snapshot, ...history].slice(0, MAX_HISTORY)
  }, chromeApi);

  return snapshot;
}

export async function getLatestSnapshot(
  chromeApi: ChromeStorageApi = chrome
): Promise<ScanSnapshot | undefined> {
  const result = await storageGet(LATEST_SNAPSHOT_KEY, chromeApi);
  const snapshot = result[LATEST_SNAPSHOT_KEY];

  return isScanSnapshot(snapshot) ? snapshot : undefined;
}

export async function removeSitesFromLatestSnapshot(
  siteKeys: string[],
  chromeApi: ChromeStorageApi = chrome
): Promise<ScanSnapshot | undefined> {
  const latest = await getLatestSnapshot(chromeApi);
  if (!latest) return undefined;

  const removed = new Set(siteKeys);
  const snapshot: ScanSnapshot = {
    ...latest,
    inventory: latest.inventory.filter((site) => !removed.has(site.siteKey)),
    reviewedSiteKeys: latest.reviewedSiteKeys.filter((key) => !removed.has(key))
  };
  const history = await getSnapshotHistory(chromeApi);

  await storageSet({
    [LATEST_SNAPSHOT_KEY]: snapshot,
    [SNAPSHOT_HISTORY_KEY]: [snapshot, ...history.filter((item) => item.id !== snapshot.id)].slice(0, MAX_HISTORY)
  }, chromeApi);

  return snapshot;
}

async function getSnapshotHistory(chromeApi: ChromeStorageApi): Promise<ScanSnapshot[]> {
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

function isScanSnapshot(value: unknown): value is ScanSnapshot {
  return typeof value === 'object' && value !== null && 'id' in value && 'inventory' in value;
}
