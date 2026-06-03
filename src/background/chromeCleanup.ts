type ChromeApi = {
  runtime: { readonly lastError: { message?: string | undefined } | undefined };
  browsingData?: {
    remove(
      options: chrome.browsingData.RemovalOptions,
      dataToRemove: chrome.browsingData.DataTypeSet,
      callback?: () => void
    ): void;
  };
};

export type LocalCleanupRequest = {
  siteKey: string;
  domains?: string[];
  origins?: string[];
};

export type LocalCleanupResult = {
  siteKey: string;
  status: 'completed';
  origins: string[];
  requestedDomains: string[];
  requestedOrigins: string[];
  removedDataTypes: string[];
  requestedAt: string;
  completedAt: string;
  remoteRevocation: 'not_attempted';
  warning: string;
  details: string[];
};

const LOCAL_CLEANUP_WARNING =
  'Local cleanup logs out this browser profile, but it does not revoke already stolen cookies.';
const REMOVED_DATA_TYPES = [
  'cookies',
  'cacheStorage',
  'fileSystems',
  'indexedDB',
  'localStorage',
  'serviceWorkers',
  'webSQL'
];

export async function clearLocalSiteData(
  request: LocalCleanupRequest,
  chromeApi: ChromeApi = chrome
): Promise<LocalCleanupResult> {
  if (!chromeApi.browsingData?.remove) {
    throw new Error('Local cleanup is not supported by this browser. Review provider sessions manually.');
  }

  const removeBrowsingData = chromeApi.browsingData.remove.bind(chromeApi.browsingData);
  const requestedAt = new Date().toISOString();
  const requestedDomains = [...new Set(request.domains ?? [])];
  const origins = normalizeCleanupOrigins(request);

  await new Promise<void>((resolve, reject) => {
    removeBrowsingData(
      {
        origins,
        originTypes: { unprotectedWeb: true, protectedWeb: true }
      },
      {
        cookies: true,
        cacheStorage: true,
        fileSystems: true,
        indexedDB: true,
        localStorage: true,
        serviceWorkers: true,
        webSQL: true
      },
      () => {
        const error = chromeError(chromeApi);
        if (error) {
          reject(error);
          return;
        }

        resolve();
      }
    );
  });

  return {
    siteKey: request.siteKey,
    status: 'completed',
    origins,
    requestedDomains,
    requestedOrigins: origins,
    removedDataTypes: REMOVED_DATA_TYPES,
    requestedAt,
    completedAt: new Date().toISOString(),
    remoteRevocation: 'not_attempted',
    warning: LOCAL_CLEANUP_WARNING,
    details: [
      'Requested local browser cookie and storage cleanup through chrome.browsingData.',
      'Remote provider session revocation was not attempted.',
      'Domain-derived origins may not cover every subdomain-specific cookie or storage bucket.'
    ]
  };
}

function normalizeCleanupOrigins(request: LocalCleanupRequest): string[] {
  const origins = new Set<string>();

  for (const origin of request.origins ?? []) {
    const normalized = normalizeOrigin(origin);
    if (normalized) origins.add(normalized);
  }

  for (const domain of request.domains ?? []) {
    const host = domain.replace(/^\./, '').trim();
    if (!host) continue;

    origins.add(`https://${host}`);
    origins.add(`http://${host}`);
  }

  origins.add(`https://${request.siteKey}`);
  origins.add(`http://${request.siteKey}`);

  return [...origins];
}

function normalizeOrigin(input: string): string | undefined {
  try {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;

    return url.origin;
  } catch {
    return undefined;
  }
}

function chromeError(chromeApi: ChromeApi): Error | undefined {
  const message = chromeApi.runtime.lastError?.message;
  return message ? new Error(message) : undefined;
}
