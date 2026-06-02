import { describe, expect, it } from 'vitest';
import { getSiteKey } from './siteKey';

describe('getSiteKey', () => {
  it.each([
    ['.accounts.google.com', 'google.com'],
    ['github.com', 'github.com'],
    ['admin.example.co.uk', 'example.co.uk'],
    ['localhost', 'localhost'],
    ['HTTPS://Login.MicrosoftOnline.COM/path', 'microsoftonline.com']
  ])('groups %s as %s', (domain, expected) => {
    expect(getSiteKey(domain)).toBe(expected);
  });

  it('keeps IP addresses as their own site keys', () => {
    expect(getSiteKey('https://127.0.0.1:3000/settings')).toBe('127.0.0.1');
  });
});
