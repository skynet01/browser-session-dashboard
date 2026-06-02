import type { SiteInventory, SiteRisk } from '../core/types';

const riskLabels: Record<SiteRisk, string> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low'
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] ?? character);
}

export function riskLabel(risk: SiteRisk): string {
  return riskLabels[risk];
}

export function sentenceCase(value: string): string {
  return value.length === 0 ? value : `${value[0]?.toUpperCase()}${value.slice(1)}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function siteMatchesQuery(site: SiteInventory, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return [site.siteKey, ...site.domains].some((value) => value.toLowerCase().includes(normalized));
}
