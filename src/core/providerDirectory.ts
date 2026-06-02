import type { ProviderAction } from './types';

type ProviderEntry = ProviderAction & {
  highValue: boolean;
};

const PROVIDERS: Record<string, ProviderEntry> = {
  'google.com': {
    label: 'Review Google sessions',
    url: 'https://myaccount.google.com/device-activity',
    instructions: 'Review devices and sessions, remove unfamiliar access, then rotate credentials if needed.',
    highValue: true
  },
  'microsoft.com': {
    label: 'Review Microsoft sign-ins',
    url: 'https://mysignins.microsoft.com/',
    instructions: 'Review sign-ins, devices, security information, and active sessions.',
    highValue: true
  },
  'microsoftonline.com': {
    label: 'Review Microsoft sign-ins',
    url: 'https://mysignins.microsoft.com/',
    instructions: 'Review sign-ins, devices, security information, and active sessions.',
    highValue: true
  },
  'apple.com': {
    label: 'Review Apple account security',
    url: 'https://account.apple.com/account/manage',
    instructions: 'Review trusted devices, account security settings, and sign-in information.',
    highValue: true
  },
  'amazon.com': {
    label: 'Review Amazon account security',
    url: 'https://www.amazon.com/a/c/r/change-your-password',
    instructions: 'Review account security, devices, payment methods, and order activity.',
    highValue: true
  },
  'github.com': {
    label: 'Review GitHub sessions',
    url: 'https://github.com/settings/security',
    instructions: 'Review sessions, tokens, SSH keys, passkeys, and connected applications.',
    highValue: true
  },
  'facebook.com': {
    label: 'Review Facebook sessions',
    url: 'https://www.facebook.com/settings?tab=security',
    instructions: 'Review where you are logged in and remove unfamiliar sessions.',
    highValue: true
  },
  'instagram.com': {
    label: 'Review Instagram login activity',
    url: 'https://www.instagram.com/accounts/login_activity/',
    instructions: 'Review login activity, remove unfamiliar sessions, and check account-center security settings.',
    highValue: true
  },
  'x.com': {
    label: 'Review X sessions',
    url: 'https://x.com/settings/sessions',
    instructions: 'Review active sessions, connected apps, and account access.',
    highValue: true
  },
  'twitter.com': {
    label: 'Review Twitter sessions',
    url: 'https://twitter.com/settings/sessions',
    instructions: 'Review active sessions, connected apps, and account access.',
    highValue: true
  },
  'linkedin.com': {
    label: 'Review LinkedIn sessions',
    url: 'https://www.linkedin.com/mypreferences/d/sessions',
    instructions: 'Review signed-in sessions and remove unfamiliar devices.',
    highValue: true
  },
  'dropbox.com': {
    label: 'Review Dropbox security',
    url: 'https://www.dropbox.com/account/security',
    instructions: 'Review web sessions, linked devices, connected apps, and security settings.',
    highValue: true
  },
  'slack.com': {
    label: 'Review Slack account settings',
    url: 'https://slack.com/account/settings',
    instructions: 'Review account settings, active sessions, and workspace app access.',
    highValue: true
  },
  'discord.com': {
    label: 'Review Discord devices',
    url: 'https://discord.com/channels/@me',
    instructions: 'Open user settings, review devices, and remove unfamiliar sessions.',
    highValue: true
  }
};

export function getProviderAction(siteKey: string): ProviderAction | undefined {
  const entry = PROVIDERS[siteKey];
  if (!entry) return undefined;

  return {
    label: entry.label,
    url: entry.url,
    instructions: entry.instructions
  };
}

export function isHighValueProvider(siteKey: string): boolean {
  return PROVIDERS[siteKey]?.highValue ?? false;
}

export function getKnownProviderSiteKeys(): string[] {
  return Object.keys(PROVIDERS).sort();
}
