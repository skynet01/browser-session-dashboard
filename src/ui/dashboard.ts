import './dashboard.css';
import type { SiteInventory, SiteReviews, SiteRisk } from '../core/types';
import { deriveReviewStatus, type SiteReviewStatus } from '../core/reviewStatus';
import type { LocalCleanupResult } from '../background/chromeCleanup';
import type { ScanSnapshot } from '../storage/snapshotStore';
import { escapeHtml, pluralize, riskLabel, sentenceCase, siteMatchesQuery } from './components';

type RuntimeRequest =
  | { type: 'scan'; suspectedCompromiseDate?: string }
  | { type: 'getCapabilities' }
  | { type: 'getLatestSnapshot' }
  | { type: 'markReviewed'; siteKey: string }
  | { type: 'unmarkReviewed'; siteKey: string }
  | { type: 'clearLocalSiteData'; siteKey: string; domains: string[]; origins: string[] };

type ExtensionCapabilities = {
  localCleanup: boolean;
  allSitesAccess?: boolean;
};

type RuntimeResponse =
  | {
      ok: true;
      snapshot?: ScanSnapshot;
      result?: LocalCleanupResult;
      capabilities?: ExtensionCapabilities;
      reviews?: SiteReviews;
    }
  | { ok: false; error: string };

type DashboardState = {
  snapshot?: ScanSnapshot;
  reviews: SiteReviews;
  severity: SiteRisk | 'all';
  query: string;
  suspectedCompromiseDate: string;
  loading: boolean;
  error?: string;
  capabilities: ExtensionCapabilities;
  actionLog: string[];
};

const state: DashboardState = {
  reviews: {},
  severity: 'all',
  query: '',
  suspectedCompromiseDate: '',
  loading: false,
  capabilities: { localCleanup: true },
  actionLog: []
};

const app = document.querySelector<HTMLElement>('#app');

if (app) {
  render();
  void loadLatestSnapshot();
  app.addEventListener('click', (event) => {
    void handleClick(event);
  });
  app.addEventListener('input', handleInput);
  app.addEventListener('change', handleInput);
}

async function loadLatestSnapshot(): Promise<void> {
  const [capabilitiesResponse, response] = await Promise.all([
    sendMessage({ type: 'getCapabilities' }),
    sendMessage({ type: 'getLatestSnapshot' })
  ]);

  if (capabilitiesResponse.ok && capabilitiesResponse.capabilities) {
    state.capabilities = capabilitiesResponse.capabilities;
  }

  if (response.ok && response.snapshot) {
    state.snapshot = response.snapshot;
    state.suspectedCompromiseDate = response.snapshot.suspectedCompromiseDate ?? '';
    state.actionLog = [`Loaded saved scan from ${formatDate(response.snapshot.scannedAt)}`, ...state.actionLog];
  } else if (!response.ok) {
    state.error = response.error;
  }

  if (response.ok && response.reviews) {
    state.reviews = response.reviews;
  }

  render();
}

async function handleClick(event: Event): Promise<void> {
  const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-action]') : null;
  if (!target) return;

  const action = target.dataset.action;
  const siteKey = target.dataset.site;

  if (action === 'scan') {
    await scan();
    return;
  }

  if (action === 'clear-high-risk') {
    await clearHighSeveritySessions();
    return;
  }

  if (!siteKey) return;
  const site = state.snapshot?.inventory.find((item) => item.siteKey === siteKey);
  if (!site) return;

  if (action === 'clear') {
    await clearSite(site);
  }

  if (action === 'review') {
    await markReviewed(site);
  }

  if (action === 'unreview') {
    await unmarkReviewed(site);
  }
}

function handleInput(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;

  if (target.dataset.control === 'severity') {
    state.severity = target.value as DashboardState['severity'];
  }

  if (target.dataset.control === 'search') {
    state.query = target.value;
  }

  if (target.dataset.control === 'suspected-date') {
    state.suspectedCompromiseDate = target.value;
  }

  render();
}

async function scan(): Promise<void> {
  state.loading = true;
  delete state.error;
  render();

  await refreshCapabilities();
  if (state.capabilities.allSitesAccess === false) {
    state.loading = false;
    render();
    return;
  }

  const response = await sendMessage(scanRequest());

  state.loading = false;
  if (response.ok && response.snapshot) {
    state.snapshot = response.snapshot;
    if (response.reviews) state.reviews = response.reviews;
    state.actionLog = [`Scan completed at ${formatDate(response.snapshot.scannedAt)}`, ...state.actionLog];
  } else {
    state.error = response.ok ? 'Scan completed without a snapshot.' : response.error;
  }

  render();
}

async function refreshCapabilities(): Promise<void> {
  const response = await sendMessage({ type: 'getCapabilities' });
  if (response.ok && response.capabilities) {
    state.capabilities = response.capabilities;
  }
}

async function clearSite(site: SiteInventory): Promise<void> {
  if (!state.capabilities.localCleanup) {
    state.error = 'Local cleanup is not supported by this browser. Open the provider review link and clear website data from browser settings if needed.';
    render();
    return;
  }

  const confirmed = confirm(
    `Clear local cookies and site data for ${site.siteKey}? Local cleanup logs out this browser, but it does not revoke stolen cookies.`
  );
  if (!confirmed) return;

  const response = await sendMessage(cleanupRequestForSite(site));

  if (response.ok && response.result) {
    if (response.snapshot) {
      state.snapshot = response.snapshot;
    } else {
      removeSitesFromSnapshot([site.siteKey]);
    }
    state.actionLog = [
      `${site.siteKey}: local cleanup ${response.result.status}. ${response.result.warning}`,
      ...state.actionLog
    ];
  } else {
    state.error = response.ok ? 'Cleanup completed without an action result.' : response.error;
  }

  render();
}

async function clearHighSeveritySessions(): Promise<void> {
  if (!state.capabilities.localCleanup) {
    state.error = 'Bulk local cleanup is not supported by this browser. Open provider review links and clear website data from browser settings if needed.';
    render();
    return;
  }

  const targets = highSeveritySessionSites();
  if (targets.length === 0) return;

  const confirmed = confirm(
    `Clear local cookies and site data for ${targets.length} high-severity sites with likely login sessions? Local cleanup logs out this browser, but it does not revoke stolen cookies.`
  );
  if (!confirmed) return;

  const cleared: string[] = [];
  const failures: string[] = [];
  let updatedSnapshot: ScanSnapshot | undefined;

  for (const site of targets) {
    const response = await sendMessage(cleanupRequestForSite(site));
    if (response.ok && response.result) {
      cleared.push(site.siteKey);
      if (response.snapshot) updatedSnapshot = response.snapshot;
    } else {
      failures.push(site.siteKey);
    }
  }

  if (cleared.length > 0) {
    if (updatedSnapshot) {
      state.snapshot = updatedSnapshot;
    } else {
      removeSitesFromSnapshot(cleared);
    }
    state.actionLog = [
      `Cleared local data for ${cleared.length} high-severity likely login session ${cleared.length === 1 ? 'site' : 'sites'}: ${cleared.join(', ')}. Local cleanup does not revoke stolen cookies.`,
      ...state.actionLog
    ];
  }

  if (failures.length > 0) {
    state.error = `Cleanup failed for: ${failures.join(', ')}`;
  }

  render();
}

async function markReviewed(site: SiteInventory): Promise<void> {
  const response = await sendMessage({ type: 'markReviewed', siteKey: site.siteKey });

  if (response.ok && response.reviews) {
    state.reviews = response.reviews;
    if (response.snapshot) state.snapshot = response.snapshot;
    state.actionLog = [`${site.siteKey}: marked reviewed`, ...state.actionLog];
  } else {
    state.error = response.ok ? 'Reviewed state was not updated.' : response.error;
  }

  render();
}

async function unmarkReviewed(site: SiteInventory): Promise<void> {
  const response = await sendMessage({ type: 'unmarkReviewed', siteKey: site.siteKey });

  if (response.ok && response.reviews) {
    state.reviews = response.reviews;
    state.actionLog = [`${site.siteKey}: review mark removed`, ...state.actionLog];
  } else {
    state.error = response.ok ? 'Reviewed state was not updated.' : response.error;
  }

  render();
}

function scanRequest(): RuntimeRequest {
  return state.suspectedCompromiseDate
    ? { type: 'scan', suspectedCompromiseDate: state.suspectedCompromiseDate }
    : { type: 'scan' };
}

async function sendMessage(message: RuntimeRequest): Promise<RuntimeResponse> {
  const runtime = (globalThis as { chrome?: { runtime?: { sendMessage?: (message: RuntimeRequest) => Promise<RuntimeResponse> } } }).chrome?.runtime;
  if (!runtime?.sendMessage) {
    return { ok: false, error: 'Extension runtime is unavailable. Load the built dist/ folder as an unpacked extension.' };
  }

  try {
    return await runtime.sendMessage(message);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Extension message failed'
    };
  }
}

type FocusSnapshot = {
  control: string;
  selectionStart: number | null;
  selectionEnd: number | null;
};

function captureFocus(): FocusSnapshot | undefined {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !active.dataset.control) return undefined;

  const selectable = active instanceof HTMLInputElement && (active.type === 'search' || active.type === 'text');

  return {
    control: active.dataset.control,
    selectionStart: selectable ? active.selectionStart : null,
    selectionEnd: selectable ? active.selectionEnd : null
  };
}

function restoreFocus(focused: FocusSnapshot | undefined): void {
  if (!focused || !app) return;

  const element = app.querySelector<HTMLElement>(`[data-control="${focused.control}"]`);
  if (!element) return;

  element.focus();
  if (element instanceof HTMLInputElement && focused.selectionStart !== null) {
    element.setSelectionRange(focused.selectionStart, focused.selectionEnd ?? focused.selectionStart);
  }
}

function render(): void {
  if (!app) return;

  const focused = captureFocus();
  const inventory = state.snapshot?.inventory ?? [];
  const unreviewed = inventory.filter((site) => !state.reviews[site.siteKey]);
  const reviewedCount = inventory.length - unreviewed.length;
  const filtered = filteredInventory(inventory);
  const bulkCleanupCount = highSeveritySessionSites().length;

  app.innerHTML = `
    <header class="topbar">
      <div>
        <p class="eyebrow">Local exposure inventory</p>
        <h1>Browser Session Compromise Dashboard</h1>
        <p class="claim">
          These are the browser sessions/sites currently present and likely exposed if this browser profile's cookies were stolen.
        </p>
      </div>
      <div class="topbar-actions">
        <label class="date-control">
          <span>Suspected compromise date</span>
          <input data-control="suspected-date" type="date" value="${escapeHtml(state.suspectedCompromiseDate)}" />
        </label>
        <button type="button" data-action="scan">${state.loading ? 'Scanning...' : 'Scan browser profile'}</button>
      </div>
    </header>
    <section class="warning-strip warning-strip--actions" role="note">
      <div>
        <strong>Local cleanup does not revoke stolen cookies.</strong>
        ${state.capabilities.localCleanup
          ? 'Clearing local browser data logs out this browser. Revoke sessions from provider security pages where possible.'
          : 'This browser does not expose extension-driven local cleanup. Revoke sessions from provider security pages and clear website data from browser settings.'}
      </div>
      <button type="button" class="secondary" data-action="clear-high-risk" ${bulkCleanupCount === 0 || !state.capabilities.localCleanup ? 'disabled' : ''}>
        Clear high-severity sessions (${bulkCleanupCount})
      </button>
    </section>
    ${state.capabilities.allSitesAccess === false ? `<section class="error-banner" role="alert">${escapeHtml(websiteAccessMessage())}</section>` : ''}
    ${state.error ? `<section class="error-banner" role="alert">${escapeHtml(state.error)}</section>` : ''}
    <section class="summary-grid" aria-label="Scan summary">
      ${summaryTile('Sites', pluralize(inventory.length, 'site'))}
      ${summaryTile('Critical', String(countRisk(unreviewed, 'critical')))}
      ${summaryTile('High', String(countRisk(unreviewed, 'high')))}
      ${summaryTile('Reviewed', String(reviewedCount))}
      ${summaryTile('Response date', state.snapshot?.suspectedCompromiseDate ? formatDateOnly(state.snapshot.suspectedCompromiseDate) : 'Not set')}
      ${summaryTile('Scanned', state.snapshot ? formatDate(state.snapshot.scannedAt) : 'Not yet')}
    </section>
    ${state.snapshot?.suspectedCompromiseDate ? `
      <section class="context-strip">
        ${escapeHtml(formatDateOnly(state.snapshot.suspectedCompromiseDate))} is the suspected compromise date, shown for incident context.
        Chrome does not expose cookie creation dates, so cookies cannot be filtered by date - sessions you reviewed are tracked per site instead.
      </section>
    ` : ''}
    <section class="workspace">
      <div class="inventory-panel">
        <div class="toolbar">
          <label>
            <span>Severity</span>
            <select data-control="severity">
              ${severityOption('all', 'All')}
              ${severityOption('critical', 'Critical')}
              ${severityOption('high', 'High')}
              ${severityOption('medium', 'Medium')}
              ${severityOption('low', 'Low')}
            </select>
          </label>
          <label class="search-label">
            <span>Search</span>
            <input data-control="search" type="search" value="${escapeHtml(state.query)}" placeholder="Domain" />
          </label>
        </div>
        <div class="site-list">
          ${filtered.length > 0 ? filtered.map(renderSiteRow).join('') : emptyState(inventory.length)}
        </div>
      </div>
      <aside class="action-panel" aria-label="Action history">
        <h2>Response Log</h2>
        ${state.actionLog.length > 0
          ? `<ol>${state.actionLog.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ol>`
          : '<p>No actions recorded yet.</p>'}
      </aside>
    </section>
  `;

  restoreFocus(focused);
}

function renderSiteRow(site: SiteInventory): string {
  const status = deriveReviewStatus(site, state.reviews[site.siteKey]);
  const primaryAction = site.providerAction ?? loginActionForSite(site.siteKey);
  const rowClasses = [
    'site-row',
    `risk-${site.risk}`,
    status ? 'is-reviewed' : '',
    status?.newSession ? 'is-new-session' : ''
  ].filter(Boolean).join(' ');

  return `
    <article class="${rowClasses}" data-site-row="${escapeHtml(site.siteKey)}">
      <div class="site-main">
        <div class="site-title">
          <h2>${escapeHtml(site.siteKey)}</h2>
          <span class="risk-pill">${riskLabel(site.risk)}</span>
          ${site.providerCategory ? `<span class="category-pill">${escapeHtml(site.providerCategory)}</span>` : ''}
          ${reviewPill(status)}
        </div>
        <p class="domains">${escapeHtml(site.domains.join(', ') || site.siteKey)}</p>
        ${reviewNote(status)}
        <ul class="reason-list">
          ${site.reasons.map((reason) => `<li>${escapeHtml(sentenceCase(reason))}</li>`).join('')}
        </ul>
      </div>
      <div class="site-metrics">
        ${metric('Cookies', site.cookieCount)}
        ${metric('Likely sessions', site.likelySessionCookieCount)}
        ${metric('Open tabs', site.openTabCount)}
      </div>
      <div class="row-actions row-actions--right">
        <a class="button-link" href="${escapeHtml(primaryAction.url)}" target="_blank" rel="noreferrer" data-action="${site.providerAction ? 'provider' : 'login'}" data-site="${escapeHtml(site.siteKey)}">${escapeHtml(primaryAction.label)}</a>
        <button type="button" class="secondary" data-action="clear" data-site="${escapeHtml(site.siteKey)}" ${state.capabilities.localCleanup ? '' : 'disabled'}>${state.capabilities.localCleanup ? 'Clear local data' : 'Cleanup unavailable'}</button>
        <button type="button" class="ghost" data-action="${status ? 'unreview' : 'review'}" data-site="${escapeHtml(site.siteKey)}">${status ? 'Unmark' : 'Mark done'}</button>
      </div>
    </article>
  `;
}

function reviewPill(status: SiteReviewStatus | undefined): string {
  if (!status) return '';
  if (status.newSession) return '<span class="new-session-pill">New session</span>';

  return `<span class="reviewed-pill">Reviewed ${escapeHtml(formatDate(status.reviewedAt))}</span>`;
}

function reviewNote(status: SiteReviewStatus | undefined): string {
  const notes: string[] = [];

  if (status?.newSession) {
    notes.push(
      `Session cookies changed since your review on ${formatDate(status.reviewedAt)} - if you revoked sessions then, this session was created after the theft and is not affected.`
    );
    if (status.residualSession) {
      notes.push('Some cookies from before the review are still present.');
    }
  } else if (status?.residualSession) {
    notes.push('Same session cookies as at review time.');
  }

  return notes.length > 0 ? `<p class="review-note">${notes.map(escapeHtml).join(' ')}</p>` : '';
}

function loginActionForSite(siteKey: string): { label: string; url: string } {
  return {
    label: `Open ${siteKey} login`,
    url: `https://${siteKey}/login`
  };
}

function filteredInventory(inventory: SiteInventory[]): SiteInventory[] {
  return inventory.filter((site) => {
    const severityMatches = state.severity === 'all' || site.risk === state.severity;
    return severityMatches && siteMatchesQuery(site, state.query);
  });
}

function highSeveritySessionSites(): SiteInventory[] {
  return (state.snapshot?.inventory ?? []).filter((site) =>
    (site.risk === 'critical' || site.risk === 'high')
    && site.likelySessionCookieCount > 0
    && !state.reviews[site.siteKey]
  );
}

function cleanupRequestForSite(site: SiteInventory): RuntimeRequest {
  return {
    type: 'clearLocalSiteData',
    siteKey: site.siteKey,
    domains: site.domains,
    origins: originsForSite(site)
  };
}

function removeSitesFromSnapshot(siteKeys: string[]): void {
  if (!state.snapshot) return;

  const removed = new Set(siteKeys);
  state.snapshot = {
    ...state.snapshot,
    inventory: state.snapshot.inventory.filter((item) => !removed.has(item.siteKey)),
    reviewedSiteKeys: state.snapshot.reviewedSiteKeys.filter((siteKey) => !removed.has(siteKey))
  };
}

function originsForSite(site: SiteInventory): string[] {
  return site.domains.flatMap((domain) => {
    const host = domain.replace(/^\./, '');
    return [`https://${host}`, `http://${host}`];
  });
}

function countRisk(inventory: SiteInventory[], risk: SiteRisk): number {
  return inventory.filter((site) => site.risk === risk).length;
}

function summaryTile(label: string, value: string): string {
  return `<div class="summary-tile"><span>${escapeHtml(label)}</span> <strong>${escapeHtml(value)}</strong></div>`;
}

function severityOption(value: DashboardState['severity'], label: string): string {
  return `<option value="${value}" ${state.severity === value ? 'selected' : ''}>${label}</option>`;
}

function metric(label: string, value: number): string {
  return `<span><strong>${value}</strong>${label}</span>`;
}

function emptyState(totalCount: number): string {
  return totalCount === 0
    ? '<div class="empty-state"><h2>No scan yet</h2><p>Run a browser profile scan to inventory likely local exposure indicators.</p></div>'
    : '<div class="empty-state"><h2>No sites match</h2><p>Adjust severity or domain filters.</p></div>';
}

function websiteAccessMessage(): string {
  return 'Website access is not granted for all websites. In Safari, click the extension toolbar item and choose Always Allow on Every Website, or open Safari Settings > Extensions > Browser Session Compromise Dashboard > Websites and set access to Allow. Without that, cookie inventory can be empty while tabs still appear.';
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatDateOnly(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(year, month - 1, day));
}
