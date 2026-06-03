import './dashboard.css';
import type { SiteInventory, SiteRisk } from '../core/types';
import type { LocalCleanupResult } from '../background/chromeCleanup';
import type { ScanSnapshot } from '../storage/snapshotStore';
import { escapeHtml, pluralize, riskLabel, sentenceCase, siteMatchesQuery } from './components';

type RuntimeRequest =
  | { type: 'scan'; suspectedCompromiseDate?: string }
  | { type: 'getLatestSnapshot' }
  | { type: 'markReviewed'; siteKey: string }
  | { type: 'clearLocalSiteData'; siteKey: string; domains: string[]; origins: string[] };

type RuntimeResponse =
  | { ok: true; snapshot?: ScanSnapshot; result?: LocalCleanupResult }
  | { ok: false; error: string };

type DashboardState = {
  snapshot?: ScanSnapshot;
  severity: SiteRisk | 'all';
  query: string;
  suspectedCompromiseDate: string;
  loading: boolean;
  error?: string;
  actionLog: string[];
};

const state: DashboardState = {
  severity: 'all',
  query: '',
  suspectedCompromiseDate: '',
  loading: false,
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
  const response = await sendMessage({ type: 'getLatestSnapshot' });

  if (response.ok && response.snapshot) {
    state.snapshot = response.snapshot;
    state.suspectedCompromiseDate = response.snapshot.suspectedCompromiseDate ?? '';
    state.actionLog = [`Loaded saved scan from ${formatDate(response.snapshot.scannedAt)}`, ...state.actionLog];
  } else if (!response.ok) {
    state.error = response.error;
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

  if (!siteKey) return;
  const site = state.snapshot?.inventory.find((item) => item.siteKey === siteKey);
  if (!site) return;

  if (action === 'clear') {
    await clearSite(site);
  }

  if (action === 'review') {
    await markReviewed(site);
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

  const response = await sendMessage(scanRequest());

  state.loading = false;
  if (response.ok && response.snapshot) {
    state.snapshot = response.snapshot;
    state.actionLog = [`Scan completed at ${formatDate(response.snapshot.scannedAt)}`, ...state.actionLog];
  } else {
    state.error = response.ok ? 'Scan completed without a snapshot.' : response.error;
  }

  render();
}

async function clearSite(site: SiteInventory): Promise<void> {
  const confirmed = confirm(
    `Clear local cookies and site data for ${site.siteKey}? Local cleanup logs out this browser, but it does not revoke stolen cookies.`
  );
  if (!confirmed) return;

  const response = await sendMessage({
    type: 'clearLocalSiteData',
    siteKey: site.siteKey,
    domains: site.domains,
    origins: originsForSite(site)
  });

  if (response.ok && response.result) {
    if (state.snapshot) {
      state.snapshot = {
        ...state.snapshot,
        inventory: state.snapshot.inventory.filter((item) => item.siteKey !== site.siteKey),
        reviewedSiteKeys: state.snapshot.reviewedSiteKeys.filter((siteKey) => siteKey !== site.siteKey)
      };
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

async function markReviewed(site: SiteInventory): Promise<void> {
  const response = await sendMessage({ type: 'markReviewed', siteKey: site.siteKey });

  if (response.ok && response.snapshot) {
    state.snapshot = response.snapshot;
    state.actionLog = [`${site.siteKey}: marked reviewed`, ...state.actionLog];
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

function render(): void {
  if (!app) return;

  const inventory = state.snapshot?.inventory ?? [];
  const filtered = filteredInventory(inventory);

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
    <section class="warning-strip" role="note">
      <strong>Local cleanup does not revoke stolen cookies.</strong>
      Clearing local browser data logs out this browser. Revoke sessions from provider security pages where possible.
    </section>
    ${state.error ? `<section class="error-banner" role="alert">${escapeHtml(state.error)}</section>` : ''}
    <section class="summary-grid" aria-label="Scan summary">
      ${summaryTile('Sites', pluralize(inventory.length, 'site'))}
      ${summaryTile('Critical', String(countRisk(inventory, 'critical')))}
      ${summaryTile('High', String(countRisk(inventory, 'high')))}
      ${summaryTile('Response date', state.snapshot?.suspectedCompromiseDate ? formatDateOnly(state.snapshot.suspectedCompromiseDate) : 'Not set')}
      ${summaryTile('Scanned', state.snapshot ? formatDate(state.snapshot.scannedAt) : 'Not yet')}
    </section>
    ${state.snapshot?.suspectedCompromiseDate ? `
      <section class="context-strip">
        Date-based scan context uses ${escapeHtml(formatDateOnly(state.snapshot.suspectedCompromiseDate))} as the suspected compromise date.
        Cookies with known creation dates after that date are hidden; Chrome may still show current cookies without creation-date metadata.
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
}

function renderSiteRow(site: SiteInventory): string {
  const reviewed = state.snapshot?.reviewedSiteKeys.includes(site.siteKey) ?? false;
  const primaryAction = site.providerAction ?? loginActionForSite(site.siteKey);
  return `
    <article class="site-row risk-${site.risk}${reviewed ? ' is-reviewed' : ''}" data-site-row="${escapeHtml(site.siteKey)}">
      <div class="site-main">
        <div class="site-title">
          <h2>${escapeHtml(site.siteKey)}</h2>
          <span class="risk-pill">${riskLabel(site.risk)}</span>
          ${site.providerCategory ? `<span class="category-pill">${escapeHtml(site.providerCategory)}</span>` : ''}
          ${reviewed ? '<span class="reviewed-pill">Reviewed</span>' : ''}
        </div>
        <p class="domains">${escapeHtml(site.domains.join(', ') || site.siteKey)}</p>
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
        <button type="button" class="secondary" data-action="clear" data-site="${escapeHtml(site.siteKey)}">Clear local data</button>
        <button type="button" class="ghost" data-action="review" data-site="${escapeHtml(site.siteKey)}">Mark done</button>
      </div>
    </article>
  `;
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
