# Browser Session Compromise Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chromium Manifest V3 extension for Chrome, Microsoft Edge, and Brave that inventories likely browser-authenticated sites after suspected cookie theft and helps the user prioritize revocation, password resets, and local cleanup.

**Architecture:** The extension treats cookies and site storage as local compromise indicators, not proof of server-side account sessions. A service worker gathers cookie/tab/site metadata through Chrome extension APIs, pure TypeScript modules classify and score domains, and a dashboard presents response actions without ever displaying or persisting cookie values.

**Tech Stack:** Chromium Manifest V3, TypeScript, Vite, Vitest, DOM Testing Library, vanilla HTML/CSS UI.

---

## Source API Constraints

- `chrome.cookies` can query and modify cookies when the extension declares `cookies` plus matching host permissions. It exposes metadata including `domain`, `httpOnly`, `secure`, `session`, `sameSite`, `storeId`, and `value`, but this product must discard `value` immediately.
- `chrome.cookies.getAll()` only returns cookies for domains where the extension has host permissions. Broad inventory requires broad host access such as `http://*/*` and `https://*/*`.
- Chrome partitioned cookies require explicit `partitionKey` handling; the first release should label partitioned-cookie coverage as limited unless implementation adds per-frame partition discovery.
- `chrome.browsingData.remove()` and `removeCookies()` can clear local cookies and storage, including origin-scoped cleanup for supported data types. This does not revoke a stolen remote copy.
- Manifest V3 service workers can be terminated between events, so scan state must live in `chrome.storage.local`, not service worker globals.

References:
- Chrome cookies API: https://developer.chrome.com/docs/extensions/reference/api/cookies
- Chrome browsingData API: https://developer.chrome.com/docs/extensions/reference/api/browsingData
- Chrome tabs API: https://developer.chrome.com/docs/extensions/reference/api/tabs
- Extension service worker lifecycle: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Microsoft Edge supported extension APIs: https://learn.microsoft.com/en-au/microsoft-edge/extensions/developer-guide/api-support
- Brave extension support: https://support.brave.app/hc/en-us/articles/360017909112-How-can-I-add-extensions-to-Brave

## Scope

In scope:
- Work on desktop Chrome, Microsoft Edge, and Brave using one Manifest V3 codebase.
- Show domains with current local cookies and likely session risk for the browser profile where the extension is installed.
- Group subdomains under a registrable-domain-style site key using a maintained public suffix parser.
- Flag likely authentication/session cookies by name and metadata while never showing values.
- Let users open known provider security/session-management pages.
- Let users clear local cookies and storage for selected origins/domains.
- Let users export a redacted response checklist.
- Show clear language that local cleanup does not invalidate already stolen cookies.

Out of scope for v1:
- Claiming exact stolen sessions.
- Automatically logging out every provider server-side.
- Reading saved passwords.
- Storing cookie values or hashes of cookie values.
- Firefox, Safari, mobile browser, and non-Chromium extension support.
- Enterprise remote management.

## Architecture Decisions

1. Use TypeScript modules with pure domain logic.
   - Rationale: session classification and scoring are security-sensitive and must be unit-testable without Chrome.

2. Use a local dashboard page instead of only a popup.
   - Rationale: the user needs scanning, filtering, selection, and response tracking. A popup is too cramped and can close mid-work.

3. Request broad host permissions explicitly at install or first scan.
   - Rationale: accurate inventory requires access to all cookies. The UI must explain why the permission is needed.

4. Use only extension APIs supported across target Chromium desktop browsers.
   - Rationale: Microsoft Edge documents support for `cookies`, `browsingData`, `tabs`, and `storage` in MV3. Brave supports nearly all Chromium-compatible extensions, so the v1 architecture should avoid Chrome-only convenience APIs unless each target browser is manually verified.

5. Never render, log, persist, export, or send cookie values.
   - Rationale: a security response tool must not become a second cookie-exfiltration target.

6. Treat remote revocation as curated provider links first.
   - Rationale: generic automatic logout is unreliable and can be unsafe. Provider-specific automation can be added later with explicit tests.

7. Prefer origin-scoped local cleanup and show what was requested.
   - Rationale: domain cookies, subdomain cookies, storage origins, and open tabs do not map perfectly. The user needs auditable action results.

## File Structure

- Create: `package.json` - project scripts and dependencies.
- Create: `tsconfig.json` - TypeScript compiler settings.
- Create: `vite.config.ts` - extension build and test config.
- Create: `public/manifest.json` - Chromium MV3 manifest copied to `dist/manifest.json`.
- Create: `src/background/serviceWorker.ts` - Chrome API message router.
- Create: `src/background/chromeCookies.ts` - wrapper around `chrome.cookies`.
- Create: `src/background/chromeCleanup.ts` - wrapper around `chrome.browsingData`.
- Create: `src/background/chromeTabs.ts` - wrapper around `chrome.tabs`.
- Create: `src/core/types.ts` - shared redacted domain/cookie/action types.
- Create: `src/core/siteKey.ts` - domain normalization and site grouping.
- Create: `src/core/sessionClassifier.ts` - likely session-cookie classifier.
- Create: `src/core/riskScoring.ts` - severity and priority scoring.
- Create: `src/core/providerDirectory.ts` - known account-security links.
- Create: `src/core/inventoryBuilder.ts` - scan aggregation pipeline.
- Create: `src/core/responseChecklist.ts` - redacted export/checklist generation.
- Create: `src/storage/snapshotStore.ts` - redacted scan history in `chrome.storage.local`.
- Create: `dashboard.html` - extension dashboard document and Vite HTML entry.
- Create: `src/ui/dashboard.ts` - dashboard controller.
- Create: `src/ui/dashboard.css` - dashboard layout and states.
- Create: `src/ui/components.ts` - small DOM render helpers.
- Create: `src/test/chromeMocks.ts` - typed Chrome API mocks.
- Create: `src/**/*.test.ts` - focused unit tests next to feature modules.

## Data Model

```ts
export type RedactedCookie = {
  name: string;
  domain: string;
  path: string;
  hostOnly: boolean;
  httpOnly: boolean;
  secure: boolean;
  session: boolean;
  sameSite: 'no_restriction' | 'lax' | 'strict' | 'unspecified';
  expirationDate?: number;
  storeId: string;
  partitioned: boolean;
};

export type SiteInventory = {
  siteKey: string;
  domains: string[];
  cookieCount: number;
  likelySessionCookieCount: number;
  openTabCount: number;
  risk: 'critical' | 'high' | 'medium' | 'low';
  reasons: string[];
  providerAction?: ProviderAction;
};
```

## Edge Cases From Compound Pass

- `HttpOnly` cookies are visible to the extension API, but they must not be shown as values.
- A site can have valid auth in IndexedDB/localStorage with no obvious auth cookie.
- Clearing local cookies does not invalidate a copied cookie already used elsewhere.
- Some providers keep sessions alive after password change; the UI must recommend session revocation where available.
- Incognito has separate cookie stores and requires extension incognito access; v1 should detect and label normal-profile-only behavior.
- Cookie stores can differ by profile/incognito window; inventory should include `storeId`.
- Public suffixes make naive `last two labels` grouping wrong for domains such as `example.co.uk`.
- Subdomain-only cookies can represent separate services, e.g. `admin.example.com` vs `www.example.com`.
- Partitioned cookies may not appear in broad unpartitioned scans unless explicitly queried.
- `SameSite=None; Secure` can indicate cross-site authentication flows, but is not automatically malicious.
- Session cookies can be less risky than long-lived persistent cookies, depending on provider behavior.
- Cookie names are heuristics; `sessionid`, `sid`, `auth`, `token`, `jwt`, `remember`, `refresh`, `csrf` need different weights.
- CSRF cookies are usually not login sessions by themselves.
- Some sites use multiple cookies where no single cookie is sufficient.
- Chrome Sync cookies and Google account cookies may behave specially during browsing-data removal.
- `browsingData.remove()` can take many seconds; UI needs pending state and action logs.
- Origin-scoped cleanup may miss domain cookies shared across subdomains unless cookie removal also walks matching cookie domains.
- Sites loaded in open tabs may immediately recreate cookies after cleanup.
- Provider security pages change URLs; broken links should be editable via `providerDirectory.ts`.
- Browser-specific extension stores and permission prompts differ; Chrome, Edge, and Brave each need manual install and scan QA.
- Brave privacy shields can change site behavior after cleanup; QA should verify the extension APIs still report cookies as expected.
- Edge enterprise policies can disable or restrict extension APIs; the UI should surface API errors instead of silently showing empty inventory.
- Broad host permissions are sensitive; the product needs transparent permission copy and no network egress.
- Exported checklists must be redacted and must not include cookie names if the user selects privacy-minimal export.

## Test Strategy

- Unit-test all pure core modules with Vitest.
- Mock Chrome APIs for service worker wrapper tests.
- Add DOM tests for dashboard filtering, selection, and destructive-action confirmation.
- Add a manual Chrome QA checklist because real cookie stores and permission prompts cannot be fully covered by unit tests.
- Treat any accidental cookie value storage or rendering as a failing security test.

---

### Task 1: Scaffold Extension Project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `public/manifest.json`
- Create: `dashboard.html`
- Create: `src/ui/dashboard.css`
- Create: `src/ui/dashboard.ts`
- Create: `src/background/serviceWorker.ts`

- [ ] **Step 1: Create project config**

Create `package.json`:

```json
{
  "name": "browser-session-compromise-dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "tldts": "^6.1.86"
  },
  "devDependencies": {
    "@testing-library/dom": "^10.4.0",
    "@types/chrome": "^0.0.287",
    "@types/node": "^22.10.2",
    "typescript": "^5.7.2",
    "vite": "^6.0.3",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Add TypeScript config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "types": ["chrome", "vitest/globals"],
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 3: Add Vite config**

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        dashboard: resolve(__dirname, 'dashboard.html'),
        serviceWorker: resolve(__dirname, 'src/background/serviceWorker.ts')
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
});
```

- [ ] **Step 4: Add Manifest V3 manifest**

Create `public/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Session Compromise Dashboard",
  "description": "Inventory likely browser sessions after suspected cookie theft and guide account revocation.",
  "version": "0.1.0",
  "minimum_chrome_version": "120",
  "permissions": ["cookies", "browsingData", "storage", "tabs"],
  "host_permissions": ["http://*/*", "https://*/*"],
  "background": {
    "service_worker": "assets/serviceWorker.js",
    "type": "module"
  },
  "action": {
    "default_title": "Session Compromise Dashboard"
  }
}
```

- [ ] **Step 5: Add minimal dashboard entry**

Create `dashboard.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Session Compromise Dashboard</title>
    <link rel="stylesheet" href="./dashboard.css" />
  </head>
  <body>
    <main id="app"></main>
    <script type="module" src="./dashboard.ts"></script>
  </body>
</html>
```

Create `src/ui/dashboard.ts`:

```ts
const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Dashboard root not found');

app.innerHTML = '<h1>Session Compromise Dashboard</h1>';
```

Create `src/ui/dashboard.css`:

```css
:root {
  color: #1c2430;
  background: #f6f7f9;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
}

main {
  max-width: 1180px;
  margin: 0 auto;
  padding: 24px;
}
```

Create `src/background/serviceWorker.ts`:

```ts
chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});
```

- [ ] **Step 6: Verify scaffold**

Run: `npm install`

Expected: dependencies install and `package-lock.json` is created.

Run: `npm run typecheck`

Expected: no TypeScript errors.

Run: `npm run build`

Expected: `dist/` contains bundled dashboard and service worker assets.

### Task 2: Define Redacted Core Types

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/types.test.ts`

- [ ] **Step 1: Write a redaction-focused type test**

Create `src/core/types.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { RedactedCookie } from './types';

describe('RedactedCookie', () => {
  it('does not include a cookie value field', () => {
    const cookie: RedactedCookie = {
      name: 'sid',
      domain: '.example.com',
      path: '/',
      hostOnly: false,
      httpOnly: true,
      secure: true,
      session: false,
      sameSite: 'lax',
      expirationDate: 1790000000,
      storeId: '0',
      partitioned: false
    };

    expect(Object.hasOwn(cookie, 'value')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/core/types.test.ts`

Expected: FAIL because `src/core/types.ts` does not exist.

- [ ] **Step 3: Implement shared types**

Create `src/core/types.ts`:

```ts
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
  expirationDate?: number;
  storeId: string;
  partitioned: boolean;
};

export type OpenTabSummary = {
  id: number;
  url: string;
  title?: string;
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
  openTabCount: number;
  risk: SiteRisk;
  reasons: string[];
  providerAction?: ProviderAction;
};
```

- [ ] **Step 4: Verify**

Run: `npm test -- src/core/types.test.ts`

Expected: PASS.

### Task 3: Build Domain Grouping and Session Classification

**Files:**
- Create: `src/core/siteKey.ts`
- Create: `src/core/siteKey.test.ts`
- Create: `src/core/sessionClassifier.ts`
- Create: `src/core/sessionClassifier.test.ts`

- [ ] **Step 1: Write domain grouping tests**

Create `src/core/siteKey.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getSiteKey } from './siteKey';

describe('getSiteKey', () => {
  it.each([
    ['.accounts.google.com', 'google.com'],
    ['github.com', 'github.com'],
    ['admin.example.co.uk', 'example.co.uk'],
    ['localhost', 'localhost']
  ])('groups %s as %s', (domain, expected) => {
    expect(getSiteKey(domain)).toBe(expected);
  });
});
```

- [ ] **Step 2: Write classifier tests**

Create `src/core/sessionClassifier.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { RedactedCookie } from './types';
import { classifyCookie } from './sessionClassifier';

const baseCookie: RedactedCookie = {
  name: 'theme',
  domain: '.example.com',
  path: '/',
  hostOnly: false,
  httpOnly: false,
  secure: true,
  session: false,
  sameSite: 'lax',
  storeId: '0',
  partitioned: false
};

describe('classifyCookie', () => {
  it('flags likely authentication cookie names', () => {
    expect(classifyCookie({ ...baseCookie, name: 'sessionid', httpOnly: true }).likelySession).toBe(true);
    expect(classifyCookie({ ...baseCookie, name: 'refresh_token', httpOnly: true }).likelySession).toBe(true);
  });

  it('does not treat csrf alone as a login session', () => {
    expect(classifyCookie({ ...baseCookie, name: 'csrf_token' }).likelySession).toBe(false);
  });

  it('adds metadata reasons without leaking values', () => {
    const result = classifyCookie({ ...baseCookie, name: 'sid', httpOnly: true, secure: true });
    expect(result.reasons).toContain('auth-like cookie name');
    expect(JSON.stringify(result)).not.toContain('cookie-value');
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npm test -- src/core/siteKey.test.ts src/core/sessionClassifier.test.ts`

Expected: FAIL because implementations do not exist.

- [ ] **Step 4: Implement site grouping**

Create `src/core/siteKey.ts`:

```ts
import { parse } from 'tldts';

export function getSiteKey(domain: string): string {
  const normalized = domain.replace(/^\./, '').toLowerCase();
  const parsed = parse(normalized, { allowPrivateDomains: true });
  return parsed.domain ?? normalized;
}
```

- [ ] **Step 5: Implement session classifier**

Create `src/core/sessionClassifier.ts`:

```ts
import type { RedactedCookie } from './types';

const AUTH_NAME_PATTERNS = [
  /\bsid\b/i,
  /session/i,
  /auth/i,
  /identity/i,
  /login/i,
  /remember/i,
  /refresh[_-]?token/i,
  /access[_-]?token/i,
  /\bjwt\b/i
];

const CSRF_ONLY_PATTERNS = [/csrf/i, /xsrf/i];

export type CookieClassification = {
  likelySession: boolean;
  reasons: string[];
};

export function classifyCookie(cookie: RedactedCookie): CookieClassification {
  const reasons: string[] = [];
  const authLikeName = AUTH_NAME_PATTERNS.some((pattern) => pattern.test(cookie.name));
  const csrfOnly = CSRF_ONLY_PATTERNS.some((pattern) => pattern.test(cookie.name));

  if (authLikeName && !csrfOnly) reasons.push('auth-like cookie name');
  if (cookie.httpOnly && authLikeName && !csrfOnly) reasons.push('HttpOnly auth-like cookie');
  if (cookie.secure && authLikeName && !csrfOnly) reasons.push('Secure auth-like cookie');
  if (!cookie.session && cookie.expirationDate && authLikeName && !csrfOnly) reasons.push('persistent auth-like cookie');

  return {
    likelySession: reasons.length > 0,
    reasons
  };
}
```

- [ ] **Step 6: Verify**

Run: `npm test -- src/core/siteKey.test.ts src/core/sessionClassifier.test.ts`

Expected: PASS.

### Task 4: Build Risk Scoring and Provider Directory

**Files:**
- Create: `src/core/providerDirectory.ts`
- Create: `src/core/providerDirectory.test.ts`
- Create: `src/core/riskScoring.ts`
- Create: `src/core/riskScoring.test.ts`

- [ ] **Step 1: Write provider directory tests**

Create `src/core/providerDirectory.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getProviderAction } from './providerDirectory';

describe('getProviderAction', () => {
  it('returns known revocation pages', () => {
    expect(getProviderAction('google.com')?.url).toContain('myaccount.google.com');
    expect(getProviderAction('github.com')?.url).toContain('github.com/settings/security');
  });

  it('returns undefined for unknown providers', () => {
    expect(getProviderAction('example.com')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Write risk scoring tests**

Create `src/core/riskScoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { scoreSiteRisk } from './riskScoring';

describe('scoreSiteRisk', () => {
  it('scores known providers with likely sessions as critical', () => {
    expect(scoreSiteRisk({ likelySessionCookieCount: 3, openTabCount: 1, hasKnownProviderAction: true }).risk).toBe('critical');
  });

  it('scores unknown sites with likely sessions as high', () => {
    expect(scoreSiteRisk({ likelySessionCookieCount: 1, openTabCount: 0, hasKnownProviderAction: false }).risk).toBe('high');
  });

  it('scores cookie-only sites without likely sessions lower', () => {
    expect(scoreSiteRisk({ likelySessionCookieCount: 0, openTabCount: 0, hasKnownProviderAction: false }).risk).toBe('low');
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npm test -- src/core/providerDirectory.test.ts src/core/riskScoring.test.ts`

Expected: FAIL because implementations do not exist.

- [ ] **Step 4: Implement provider directory**

Create `src/core/providerDirectory.ts`:

```ts
import type { ProviderAction } from './types';

const PROVIDERS: Record<string, ProviderAction> = {
  'google.com': {
    label: 'Review Google sessions',
    url: 'https://myaccount.google.com/device-activity',
    instructions: 'Review devices, remove unknown access, then change password if needed.'
  },
  'github.com': {
    label: 'Review GitHub sessions',
    url: 'https://github.com/settings/security',
    instructions: 'Review sessions, tokens, SSH keys, and connected applications.'
  },
  'microsoft.com': {
    label: 'Review Microsoft sign-ins',
    url: 'https://mysignins.microsoft.com/security-info',
    instructions: 'Review sign-ins and security information.'
  },
  'facebook.com': {
    label: 'Review Facebook login sessions',
    url: 'https://www.facebook.com/security/2fac/settings',
    instructions: 'Review where you are logged in and remove unfamiliar sessions.'
  }
};

export function getProviderAction(siteKey: string): ProviderAction | undefined {
  return PROVIDERS[siteKey];
}
```

- [ ] **Step 5: Implement risk scoring**

Create `src/core/riskScoring.ts`:

```ts
import type { SiteRisk } from './types';

export type RiskInput = {
  likelySessionCookieCount: number;
  openTabCount: number;
  hasKnownProviderAction: boolean;
};

export type RiskResult = {
  risk: SiteRisk;
  reasons: string[];
};

export function scoreSiteRisk(input: RiskInput): RiskResult {
  const reasons: string[] = [];

  if (input.likelySessionCookieCount > 0) reasons.push('likely session cookies present');
  if (input.openTabCount > 0) reasons.push('site is currently open');
  if (input.hasKnownProviderAction) reasons.push('known account-security page available');

  if (input.likelySessionCookieCount > 0 && input.hasKnownProviderAction) {
    return { risk: 'critical', reasons };
  }

  if (input.likelySessionCookieCount > 0) {
    return { risk: 'high', reasons };
  }

  if (input.openTabCount > 0) {
    return { risk: 'medium', reasons };
  }

  return { risk: 'low', reasons };
}
```

- [ ] **Step 6: Verify**

Run: `npm test -- src/core/providerDirectory.test.ts src/core/riskScoring.test.ts`

Expected: PASS.

### Task 5: Build Inventory Pipeline

**Files:**
- Create: `src/core/inventoryBuilder.ts`
- Create: `src/core/inventoryBuilder.test.ts`
- Create: `src/background/chromeCookies.ts`
- Create: `src/background/chromeTabs.ts`
- Create: `src/test/chromeMocks.ts`

- [ ] **Step 1: Write inventory tests**

Create `src/core/inventoryBuilder.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { OpenTabSummary, RedactedCookie } from './types';
import { buildInventory } from './inventoryBuilder';

const cookies: RedactedCookie[] = [
  {
    name: 'sessionid',
    domain: '.github.com',
    path: '/',
    hostOnly: false,
    httpOnly: true,
    secure: true,
    session: false,
    sameSite: 'lax',
    expirationDate: 1790000000,
    storeId: '0',
    partitioned: false
  },
  {
    name: 'theme',
    domain: 'docs.github.com',
    path: '/',
    hostOnly: true,
    httpOnly: false,
    secure: true,
    session: false,
    sameSite: 'lax',
    storeId: '0',
    partitioned: false
  }
];

const tabs: OpenTabSummary[] = [{ id: 1, url: 'https://github.com/settings/security', title: 'GitHub' }];

describe('buildInventory', () => {
  it('groups cookies and tabs by site key', () => {
    const [site] = buildInventory(cookies, tabs);
    expect(site?.siteKey).toBe('github.com');
    expect(site?.cookieCount).toBe(2);
    expect(site?.likelySessionCookieCount).toBe(1);
    expect(site?.openTabCount).toBe(1);
    expect(site?.risk).toBe('critical');
  });

  it('does not leak cookie values in serialized output', () => {
    expect(JSON.stringify(buildInventory(cookies, tabs))).not.toContain('value');
  });
});
```

- [ ] **Step 2: Run inventory test to verify failure**

Run: `npm test -- src/core/inventoryBuilder.test.ts`

Expected: FAIL because implementation does not exist.

- [ ] **Step 3: Implement inventory builder**

Create `src/core/inventoryBuilder.ts`:

```ts
import { getProviderAction } from './providerDirectory';
import { scoreSiteRisk } from './riskScoring';
import { classifyCookie } from './sessionClassifier';
import { getSiteKey } from './siteKey';
import type { OpenTabSummary, RedactedCookie, SiteInventory } from './types';

export function buildInventory(cookies: RedactedCookie[], tabs: OpenTabSummary[]): SiteInventory[] {
  const bySite = new Map<string, { cookies: RedactedCookie[]; tabs: OpenTabSummary[] }>();

  for (const cookie of cookies) {
    const siteKey = getSiteKey(cookie.domain);
    const group = bySite.get(siteKey) ?? { cookies: [], tabs: [] };
    group.cookies.push(cookie);
    bySite.set(siteKey, group);
  }

  for (const tab of tabs) {
    const host = new URL(tab.url).hostname;
    const siteKey = getSiteKey(host);
    const group = bySite.get(siteKey) ?? { cookies: [], tabs: [] };
    group.tabs.push(tab);
    bySite.set(siteKey, group);
  }

  return [...bySite.entries()]
    .map(([siteKey, group]) => {
      const likelySessionCookieCount = group.cookies.filter((cookie) => classifyCookie(cookie).likelySession).length;
      const providerAction = getProviderAction(siteKey);
      const risk = scoreSiteRisk({
        likelySessionCookieCount,
        openTabCount: group.tabs.length,
        hasKnownProviderAction: Boolean(providerAction)
      });

      return {
        siteKey,
        domains: [...new Set(group.cookies.map((cookie) => cookie.domain))].sort(),
        cookieCount: group.cookies.length,
        likelySessionCookieCount,
        openTabCount: group.tabs.length,
        risk: risk.risk,
        reasons: risk.reasons,
        providerAction
      };
    })
    .sort((a, b) => riskRank(b.risk) - riskRank(a.risk) || a.siteKey.localeCompare(b.siteKey));
}

function riskRank(risk: SiteInventory['risk']): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[risk];
}
```

- [ ] **Step 4: Implement Chrome wrapper contracts**

Create `src/background/chromeCookies.ts`:

```ts
import type { RedactedCookie } from '../core/types';

export async function listRedactedCookies(): Promise<RedactedCookie[]> {
  const cookies = await chrome.cookies.getAll({});
  return cookies.map((cookie) => {
    const redacted: RedactedCookie = {
      name: cookie.name,
      domain: cookie.domain,
      path: cookie.path,
      hostOnly: cookie.hostOnly,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      session: cookie.session,
      sameSite: cookie.sameSite,
      storeId: cookie.storeId,
      partitioned: Boolean(cookie.partitionKey)
    };

    if (cookie.expirationDate !== undefined) redacted.expirationDate = cookie.expirationDate;

    return redacted;
  });
}
```

Create `src/background/chromeTabs.ts`:

```ts
import type { OpenTabSummary } from '../core/types';

export async function listOpenHttpTabs(): Promise<OpenTabSummary[]> {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((tab) => tab.id !== undefined && tab.url?.startsWith('http'))
    .map((tab) => {
      const summary: OpenTabSummary = {
        id: tab.id as number,
        url: tab.url as string
      };

      if (tab.title !== undefined) summary.title = tab.title;

      return summary;
    });
}
```

- [ ] **Step 5: Verify**

Run: `npm test -- src/core/inventoryBuilder.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

### Task 6: Add Local Cleanup and Action Logging

**Files:**
- Create: `src/background/chromeCleanup.ts`
- Create: `src/background/chromeCleanup.test.ts`
- Create: `src/storage/snapshotStore.ts`
- Create: `src/storage/snapshotStore.test.ts`
- Modify: `src/background/serviceWorker.ts`

- [ ] **Step 1: Write cleanup input tests**

Create `src/background/chromeCleanup.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { clearOriginsForSite } from './chromeCleanup';

describe('clearOriginsForSite', () => {
  it('uses origin-scoped browsing data cleanup', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', { browsingData: { remove } });

    await clearOriginsForSite(['https://github.com', 'https://docs.github.com']);

    expect(remove).toHaveBeenCalledWith(
      { origins: ['https://github.com', 'https://docs.github.com'] },
      { cookies: true, localStorage: true, indexedDB: true, cacheStorage: true, serviceWorkers: true }
    );
  });
});
```

- [ ] **Step 2: Implement cleanup wrapper**

Create `src/background/chromeCleanup.ts`:

```ts
export async function clearOriginsForSite(origins: string[]): Promise<void> {
  await chrome.browsingData.remove(
    { origins },
    {
      cookies: true,
      localStorage: true,
      indexedDB: true,
      cacheStorage: true,
      serviceWorkers: true
    }
  );
}
```

- [ ] **Step 3: Write snapshot-store test**

Create `src/storage/snapshotStore.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { SiteInventory } from '../core/types';
import { saveInventorySnapshot } from './snapshotStore';

describe('saveInventorySnapshot', () => {
  it('stores only redacted inventory', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', { storage: { local: { set } } });

    const inventory: SiteInventory[] = [{
      siteKey: 'github.com',
      domains: ['.github.com'],
      cookieCount: 2,
      likelySessionCookieCount: 1,
      openTabCount: 0,
      risk: 'high',
      reasons: ['likely session cookies present']
    }];

    await saveInventorySnapshot(inventory);

    expect(JSON.stringify(set.mock.calls)).not.toContain('value');
    expect(set).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 4: Implement snapshot store**

Create `src/storage/snapshotStore.ts`:

```ts
import type { SiteInventory } from '../core/types';

export async function saveInventorySnapshot(inventory: SiteInventory[]): Promise<void> {
  await chrome.storage.local.set({
    latestInventorySnapshot: {
      createdAt: new Date().toISOString(),
      inventory
    }
  });
}
```

- [ ] **Step 5: Wire service worker messages**

Modify `src/background/serviceWorker.ts`:

```ts
import { buildInventory } from '../core/inventoryBuilder';
import { saveInventorySnapshot } from '../storage/snapshotStore';
import { clearOriginsForSite } from './chromeCleanup';
import { listRedactedCookies } from './chromeCookies';
import { listOpenHttpTabs } from './chromeTabs';

chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(message).then(sendResponse).catch((error: unknown) => {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' });
  });
  return true;
});

async function handleMessage(message: unknown): Promise<unknown> {
  if (isMessage(message, 'scan')) {
    const inventory = buildInventory(await listRedactedCookies(), await listOpenHttpTabs());
    await saveInventorySnapshot(inventory);
    return { ok: true, inventory };
  }

  if (isMessage(message, 'clearOrigins')) {
    await clearOriginsForSite(message.origins);
    return { ok: true };
  }

  return { ok: false, error: 'Unsupported message' };
}

function isMessage(message: unknown, type: 'scan'): message is { type: 'scan' };
function isMessage(message: unknown, type: 'clearOrigins'): message is { type: 'clearOrigins'; origins: string[] };
function isMessage(message: unknown, type: string): boolean {
  return typeof message === 'object' && message !== null && 'type' in message && message.type === type;
}
```

- [ ] **Step 6: Verify**

Run: `npm test -- src/background/chromeCleanup.test.ts src/storage/snapshotStore.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

### Task 7: Build Dashboard UI

**Files:**
- Modify: `src/ui/dashboard.ts`
- Modify: `src/ui/dashboard.css`
- Create: `src/ui/components.ts`
- Create: `src/ui/dashboard.test.ts`

- [ ] **Step 1: Write dashboard DOM tests**

Create `src/ui/dashboard.test.ts`:

```ts
import { screen } from '@testing-library/dom';
import { describe, expect, it } from 'vitest';
import type { SiteInventory } from '../core/types';
import { renderDashboard } from './dashboard';

const inventory: SiteInventory[] = [{
  siteKey: 'github.com',
  domains: ['.github.com'],
  cookieCount: 2,
  likelySessionCookieCount: 1,
  openTabCount: 1,
  risk: 'critical',
  reasons: ['likely session cookies present'],
  providerAction: {
    label: 'Review GitHub sessions',
    url: 'https://github.com/settings/security',
    instructions: 'Review sessions, tokens, SSH keys, and connected applications.'
  }
}];

describe('renderDashboard', () => {
  it('renders risk and provider action without cookie values', () => {
    document.body.innerHTML = '<main id="app"></main>';
    renderDashboard(document.querySelector('#app') as HTMLElement, inventory);

    expect(screen.queryByText('github.com')).not.toBeNull();
    expect(screen.queryByText('critical')).not.toBeNull();
    expect(screen.queryByText('Review GitHub sessions')).not.toBeNull();
    expect(document.body.textContent).not.toContain('value');
  });
});
```

- [ ] **Step 2: Implement render helpers**

Create `src/ui/components.ts`:

```ts
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}
```

- [ ] **Step 3: Implement dashboard rendering**

Modify `src/ui/dashboard.ts`:

```ts
import type { SiteInventory } from '../core/types';
import { el } from './components';
import './dashboard.css';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Dashboard root not found');

void scan().then((inventory) => renderDashboard(app, inventory));

export function renderDashboard(root: HTMLElement, inventory: SiteInventory[]): void {
  root.innerHTML = '';
  root.append(
    el('h1', {}, 'Session Compromise Dashboard'),
    el('p', { class: 'warning' }, 'Clearing local data does not invalidate a copied cookie. Use provider security pages to revoke remote sessions.')
  );

  const list = el('section', { class: 'site-list', 'aria-label': 'Likely exposed sites' });

  for (const site of inventory) {
    const item = el('article', { class: `site-card risk-${site.risk}` });
    item.append(
      el('h2', {}, site.siteKey),
      el('span', { class: 'risk' }, site.risk),
      el('p', {}, `${site.likelySessionCookieCount} likely session cookies, ${site.cookieCount} total cookies, ${site.openTabCount} open tabs`)
    );

    if (site.providerAction) {
      const link = el('a', { href: site.providerAction.url, target: '_blank', rel: 'noreferrer' }, site.providerAction.label);
      item.append(link);
    }

    list.append(item);
  }

  root.append(list);
}

async function scan(): Promise<SiteInventory[]> {
  const response = await chrome.runtime.sendMessage({ type: 'scan' });
  if (!response?.ok) throw new Error(response?.error ?? 'Scan failed');
  return response.inventory;
}
```

- [ ] **Step 4: Implement dashboard CSS**

Modify `src/ui/dashboard.css`:

```css
:root {
  color: #1c2430;
  background: #f6f7f9;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
}

main {
  max-width: 1180px;
  margin: 0 auto;
  padding: 24px;
}

h1 {
  font-size: 28px;
  margin: 0 0 12px;
}

.warning {
  border-left: 4px solid #b42318;
  background: #fff4f2;
  padding: 12px;
}

.site-list {
  display: grid;
  gap: 12px;
  margin-top: 18px;
}

.site-card {
  background: #ffffff;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  padding: 16px;
}

.site-card h2 {
  display: inline-block;
  font-size: 18px;
  margin: 0 12px 0 0;
}

.risk {
  font-weight: 700;
  text-transform: uppercase;
}

.risk-critical {
  border-color: #b42318;
}

.risk-high {
  border-color: #d97706;
}
```

- [ ] **Step 5: Verify**

Run: `npm test -- src/ui/dashboard.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

### Task 8: Add Response Checklist Export

**Files:**
- Create: `src/core/responseChecklist.ts`
- Create: `src/core/responseChecklist.test.ts`
- Modify: `src/ui/dashboard.ts`

- [ ] **Step 1: Write checklist tests**

Create `src/core/responseChecklist.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { SiteInventory } from './types';
import { buildResponseChecklist } from './responseChecklist';

describe('buildResponseChecklist', () => {
  it('exports a redacted prioritized checklist', () => {
    const inventory: SiteInventory[] = [{
      siteKey: 'github.com',
      domains: ['.github.com'],
      cookieCount: 2,
      likelySessionCookieCount: 1,
      openTabCount: 0,
      risk: 'critical',
      reasons: ['likely session cookies present']
    }];

    const checklist = buildResponseChecklist(inventory);

    expect(checklist).toContain('github.com');
    expect(checklist).toContain('Revoke active sessions');
    expect(checklist).not.toContain('cookie value');
  });
});
```

- [ ] **Step 2: Implement checklist builder**

Create `src/core/responseChecklist.ts`:

```ts
import type { SiteInventory } from './types';

export function buildResponseChecklist(inventory: SiteInventory[]): string {
  const lines = [
    '# Session Compromise Response Checklist',
    '',
    'This checklist is redacted. It does not include cookie values.',
    '',
    ...inventory.map((site) => [
      `## ${site.siteKey}`,
      `Risk: ${site.risk}`,
      `Likely session cookies: ${site.likelySessionCookieCount}`,
      '- Revoke active sessions from the provider security page when available.',
      '- Change password if the provider does not offer reliable session revocation.',
      '- Review MFA, API tokens, OAuth apps, passkeys, recovery email, and backup codes.',
      '- Clear local browser data only after remote revocation is complete.'
    ].join('\n'))
  ];

  return lines.join('\n');
}
```

- [ ] **Step 3: Verify**

Run: `npm test -- src/core/responseChecklist.test.ts`

Expected: PASS.

### Task 9: Manual Chrome QA and Security Review

**Files:**
- Create: `docs/manual-qa.md`
- Create: `docs/security-model.md`
- Create: `docs/browser-compatibility.md`

- [ ] **Step 1: Create manual QA checklist**

Create `docs/manual-qa.md`:

```md
# Manual QA

## Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable Developer Mode.
4. Load `dist/` as an unpacked extension.
5. Confirm Chrome permission prompt includes cookies/site access expectations.
6. Click the extension action.
7. Confirm the dashboard opens in a tab.
8. Confirm high-risk known providers appear near the top.
9. Confirm cookie values are not visible anywhere in the page.
10. Open DevTools console and confirm cookie values are not logged.
11. Use a low-risk test origin and run local cleanup.
12. Confirm the UI shows a pending state while cleanup runs.
13. Confirm the test origin's cookies/storage are removed.
14. Confirm remote-revocation warning remains visible.

## Microsoft Edge

1. Run `npm run build`.
2. Open `edge://extensions`.
3. Enable Developer Mode.
4. Load `dist/` as an unpacked extension.
5. Repeat the Chrome scan, provider-link, no-cookie-value, and cleanup checks.
6. If an enterprise policy blocks an API, confirm the dashboard shows the error.

## Brave

1. Run `npm run build`.
2. Open `brave://extensions`.
3. Enable Developer Mode.
4. Load `dist/` as an unpacked extension.
5. Repeat the Chrome scan, provider-link, no-cookie-value, and cleanup checks.
6. Test with Brave Shields both enabled and disabled on a low-risk test site.
```

- [ ] **Step 2: Create security model**

Create `docs/security-model.md`:

```md
# Security Model

## Claims

- The extension inventories local browser cookies and site data as compromise indicators.
- The extension helps prioritize remote account-session revocation.
- The extension can clear local browser data.

## Non-Claims

- The extension does not prove which cookies were stolen.
- The extension does not invalidate stolen cookies by clearing local data.
- The extension does not guarantee server-side logout.

## Sensitive Data Rules

- Cookie values must never be rendered.
- Cookie values must never be stored.
- Cookie values must never be logged.
- Cookie values must never be exported.
- The extension must not make network requests except user-clicked provider links.
```

- [ ] **Step 3: Create browser compatibility note**

Create `docs/browser-compatibility.md`:

```md
# Browser Compatibility

## Supported Browsers

- Google Chrome desktop
- Microsoft Edge desktop
- Brave desktop

## API Basis

The extension uses Manifest V3 APIs that are supported by Chrome and documented as supported by Microsoft Edge: `cookies`, `browsingData`, `tabs`, `runtime`, and `storage`.

Brave supports nearly all Chromium-compatible extensions. Treat Brave as manually verified rather than guaranteed by a separate Brave API matrix.

## Distribution

- Chrome: Chrome Web Store or unpacked `dist/` during development.
- Edge: Microsoft Edge Add-ons or unpacked `dist/` during development.
- Brave: Chrome Web Store or unpacked `dist/` during development.

## Compatibility Risks

- Browser permission prompts can differ.
- Edge enterprise policies can restrict extension APIs.
- Brave privacy features can change site behavior, but extension cookie APIs should still be manually verified.
- Incognito/private windows require per-browser extension permission and remain out of scope for v1 unless explicitly enabled.
```

- [ ] **Step 4: Final verification**

Run: `npm test`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

Complete the manual QA checklist in Chrome.

## Open Questions Before Implementation

1. Should broad host permissions be required up front, or should the extension support a lower-permission mode that scans only user-approved domains?
2. Should v1 include incognito support, or explicitly label inventory as normal-profile-only?
3. Should the dashboard include privacy-minimal mode that hides cookie names and only shows counts/reasons?
4. Should provider links be manually maintained only, or should the extension allow a user-editable provider directory?

## Recommended v1 Acceptance Criteria

- A user can open the dashboard and scan current normal-profile cookies.
- The same built extension can be loaded and manually verified in Chrome, Edge, and Brave desktop.
- The dashboard groups sites, scores risk, and shows known provider security links.
- The dashboard clearly states that local cleanup does not revoke stolen remote sessions.
- The user can clear local data for selected origins.
- The user can export a redacted response checklist.
- Tests prove cookie values are not part of core data models, inventory output, dashboard output, storage snapshots, or checklist export.

## Compound Architecture Review Result

The architecture is sound for the stated use case if the product remains disciplined about claims. The strongest design boundary is that inventory is redacted and heuristic, while revocation is provider-directed. The largest implementation risks are broad permissions, partitioned-cookie coverage, domain/origin cleanup mismatch, and accidental value leakage through logs or storage. These are addressed by explicit permission copy, limited claims, typed redacted models, unit tests, manual QA, and a future path for provider-specific revocation flows.
