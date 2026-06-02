import { parse } from 'tldts';

export function getSiteKey(input: string): string {
  const hostname = normalizeHostname(input);
  if (!hostname) return '';

  const parsed = parse(hostname, { allowPrivateDomains: true });
  return parsed.domain ?? hostname;
}

function normalizeHostname(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return '';

  const candidate = trimmed.startsWith('.') ? trimmed.slice(1) : trimmed;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(candidate) ? candidate : `https://${candidate}`;

  try {
    return new URL(withScheme).hostname.replace(/^\./, '').replace(/\.$/, '');
  } catch {
    return candidate.split('/')[0]?.split(':')[0]?.replace(/^\./, '').replace(/\.$/, '') ?? candidate;
  }
}
