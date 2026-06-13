export type ChromeStorageApi = {
  runtime: { readonly lastError: { message?: string | undefined } | undefined };
  storage: {
    local: {
      get(key: string, callback: (items: Record<string, unknown>) => void): void;
      set(items: Record<string, unknown>, callback?: () => void): void;
    };
  };
};

export async function storageGet(
  key: string,
  chromeApi: ChromeStorageApi
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

export async function storageSet(
  items: Record<string, unknown>,
  chromeApi: ChromeStorageApi
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

function chromeError(chromeApi: ChromeStorageApi): Error | undefined {
  const message = chromeApi.runtime.lastError?.message;
  return message ? new Error(message) : undefined;
}
