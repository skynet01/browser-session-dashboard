export type SameSiteStatus = 'no_restriction' | 'lax' | 'strict' | 'unspecified';

export type RedactedCookie = {
  name: string;
  domain: string;
  path: string;
  hostOnly: boolean;
  httpOnly: boolean;
  secure: boolean;
  session: boolean;
  sameSite: SameSiteStatus;
  creationDate?: number;
  expirationDate?: number;
  storeId: string;
  partitioned: boolean;
};

export type OpenTabSummary = {
  id: number;
  windowId?: number;
  url: string;
  title?: string;
  host?: string;
  origin?: string;
};

export type ProviderAction = {
  label: string;
  url: string;
  instructions: string;
};

export type SiteRisk = 'critical' | 'high' | 'medium' | 'low';

export type SiteInventory = {
  siteKey: string;
  domains: string[];
  cookieCount: number;
  likelySessionCookieCount: number;
  likelySessionCookieNames?: string[];
  openTabCount: number;
  risk: SiteRisk;
  reasons: string[];
  providerAction?: ProviderAction;
};
