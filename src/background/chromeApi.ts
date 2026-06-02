export type ChromeApi = {
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
  action: {
    onClicked: {
      addListener(listener: () => void): void;
    };
  };
  cookies: {
    getAll(details: chrome.cookies.GetAllDetails, callback: (cookies: chrome.cookies.Cookie[]) => void): void;
  };
  tabs: {
    create(properties: chrome.tabs.CreateProperties, callback?: (tab: chrome.tabs.Tab) => void): void;
    query(queryInfo: chrome.tabs.QueryInfo, callback: (tabs: chrome.tabs.Tab[]) => void): void;
  };
  browsingData: {
    remove(
      options: chrome.browsingData.RemovalOptions,
      dataToRemove: chrome.browsingData.DataTypeSet,
      callback?: () => void
    ): void;
  };
  storage: {
    local: {
      get(keys: string | string[] | Record<string, unknown> | null, callback: (items: Record<string, unknown>) => void): void;
      set(items: Record<string, unknown>, callback?: () => void): void;
    };
  };
};

export function chromeError(chromeApi: ChromeApi): Error | undefined {
  const message = chromeApi.runtime.lastError?.message;
  return message ? new Error(message) : undefined;
}

export function defaultChromeApi(): ChromeApi {
  return chrome as unknown as ChromeApi;
}
