import type { ProviderAction, ProviderCategory } from './types';

type ProviderEntry = ProviderAction & {
  category: ProviderCategory;
  highValue: boolean;
};

const PROVIDERS: Record<string, ProviderEntry> = {
  'google.com': {
    label: 'Review Google session page',
    url: 'https://myaccount.google.com/device-activity',
    instructions: 'Review devices and sessions, remove unfamiliar access, then rotate credentials if needed.',
    category: 'Identity',
    highValue: true
  },
  'microsoft.com': {
    label: 'Review Microsoft sign-in page',
    url: 'https://mysignins.microsoft.com/',
    instructions: 'Review sign-ins, devices, security information, and active sessions.',
    category: 'Identity',
    highValue: true
  },
  'microsoftonline.com': {
    label: 'Review Microsoft work sign-ins',
    url: 'https://mysignins.microsoft.com/',
    instructions: 'Review sign-ins, devices, security information, and active sessions.',
    category: 'Identity',
    highValue: true
  },
  'live.com': {
    label: 'Review Microsoft account activity',
    url: 'https://account.live.com/Activity',
    instructions: 'Review recent personal-account sign-in activity and mark unfamiliar activity as suspicious.',
    category: 'Email',
    highValue: true
  },
  'outlook.com': {
    label: 'Review Microsoft account activity',
    url: 'https://account.live.com/Activity',
    instructions: 'Review recent personal-account sign-in activity and mark unfamiliar activity as suspicious.',
    category: 'Email',
    highValue: true
  },
  'apple.com': {
    label: 'Review Apple account security',
    url: 'https://account.apple.com/account/manage',
    instructions: 'Review trusted devices, account security settings, and sign-in information.',
    category: 'Identity',
    highValue: true
  },
  'amazon.com': {
    label: 'Review Amazon account security',
    url: 'https://www.amazon.com/a/c/r/change-your-password',
    instructions: 'Review account security, devices, payment methods, and order activity.',
    category: 'Commerce',
    highValue: true
  },
  'github.com': {
    label: 'Review GitHub session page',
    url: 'https://github.com/settings/security',
    instructions: 'Review sessions, tokens, SSH keys, passkeys, and connected applications.',
    category: 'Developer',
    highValue: true
  },
  'paypal.com': {
    label: 'Review PayPal security page',
    url: 'https://www.paypal.com/myaccount/security',
    instructions: 'Review password, passkeys, 2-step verification, trusted devices, and recent account activity where available.',
    category: 'Finance',
    highValue: true
  },
  'ebay.com': {
    label: 'Review eBay sign-in security',
    url: 'https://signin.ebay.com/ws/eBayISAPI.dll?SignIn&ru=https%3A%2F%2Fwww.ebay.com%2Fmye%2Fmyebay%2Faccount',
    instructions: 'Review sign-in and security settings, passkeys, 2-step verification, and account changes.',
    category: 'Commerce',
    highValue: true
  },
  'netflix.com': {
    label: 'Review Netflix devices',
    url: 'https://www.netflix.com/ManageDevices',
    instructions: 'Review manage access and devices, sign out unfamiliar devices, and rotate credentials if needed.',
    category: 'Entertainment',
    highValue: true
  },
  'reddit.com': {
    label: 'Review Reddit account activity',
    url: 'https://www.reddit.com/account-activity',
    instructions: 'Review account activity and log out unfamiliar sessions when the account activity page is available.',
    category: 'Social',
    highValue: true
  },
  'yahoo.com': {
    label: 'Review Yahoo recent activity',
    url: 'https://login.yahoo.com/account/activity',
    instructions: 'Review recent account activity and remove or secure unfamiliar access.',
    category: 'Email',
    highValue: true
  },
  'facebook.com': {
    label: 'Review Facebook session page',
    url: 'https://www.facebook.com/settings?tab=security',
    instructions: 'Review where you are logged in and remove unfamiliar sessions.',
    category: 'Social',
    highValue: true
  },
  'instagram.com': {
    label: 'Review Instagram login activity',
    url: 'https://www.instagram.com/accounts/login_activity/',
    instructions: 'Review login activity, remove unfamiliar sessions, and check account-center security settings.',
    category: 'Social',
    highValue: true
  },
  'x.com': {
    label: 'Review X session page',
    url: 'https://x.com/settings/sessions',
    instructions: 'Review active sessions, connected apps, and account access.',
    category: 'Social',
    highValue: true
  },
  'twitter.com': {
    label: 'Review Twitter session page',
    url: 'https://twitter.com/settings/sessions',
    instructions: 'Review active sessions, connected apps, and account access.',
    category: 'Social',
    highValue: true
  },
  'linkedin.com': {
    label: 'Review LinkedIn session page',
    url: 'https://www.linkedin.com/mypreferences/d/sessions',
    instructions: 'Review signed-in sessions and remove unfamiliar devices.',
    category: 'Social',
    highValue: true
  },
  'dropbox.com': {
    label: 'Review Dropbox security',
    url: 'https://www.dropbox.com/account/security',
    instructions: 'Review web sessions, linked devices, connected apps, and security settings.',
    category: 'Cloud',
    highValue: true
  },
  'slack.com': {
    label: 'Review Slack account settings',
    url: 'https://slack.com/account/settings',
    instructions: 'Review account settings, active sessions, and workspace app access.',
    category: 'Messaging',
    highValue: true
  },
  'discord.com': {
    label: 'Review Discord devices',
    url: 'https://discord.com/channels/@me',
    instructions: 'Open user settings, review devices, and remove unfamiliar sessions.',
    category: 'Messaging',
    highValue: true
  },
  'telegram.org': {
    label: 'Open Telegram Web sessions',
    url: 'https://web.telegram.org/',
    instructions: 'Open settings, review devices or active sessions, and terminate unfamiliar sessions.',
    category: 'Messaging',
    highValue: true
  },
  'whatsapp.com': {
    label: 'Open WhatsApp linked devices',
    url: 'https://web.whatsapp.com/',
    instructions: 'Review linked devices from WhatsApp and log out unfamiliar browsers or desktops.',
    category: 'Messaging',
    highValue: true
  },
  'steamcommunity.com': {
    label: 'Review Steam account security',
    url: 'https://steamcommunity.com/my/account/',
    instructions: 'Review Steam Guard, authorized devices, account activity, and revoke unfamiliar access.',
    category: 'Gaming',
    highValue: true
  },
  'steampowered.com': {
    label: 'Review Steam account security',
    url: 'https://steamcommunity.com/my/account/',
    instructions: 'Review Steam Guard, authorized devices, account activity, and revoke unfamiliar access.',
    category: 'Gaming',
    highValue: true
  },
  'twitch.tv': {
    label: 'Review Twitch security settings',
    url: 'https://www.twitch.tv/settings/security',
    instructions: 'Review login security, connected apps, and recent account activity where available.',
    category: 'Entertainment',
    highValue: true
  },
  'spotify.com': {
    label: 'Review Spotify account page',
    url: 'https://www.spotify.com/account/',
    instructions: 'Review account access, sign out everywhere if needed, and rotate credentials.',
    category: 'Entertainment',
    highValue: true
  },
  'notion.so': {
    label: 'Review Notion account settings',
    url: 'https://www.notion.so/my-account',
    instructions: 'Review account settings, connected apps, workspace access, and active browser sessions.',
    category: 'Productivity',
    highValue: true
  },
  'figma.com': {
    label: 'Review Figma account settings',
    url: 'https://www.figma.com/settings',
    instructions: 'Review account security, connected apps, team access, and recent account changes.',
    category: 'Productivity',
    highValue: true
  },
  'atlassian.net': {
    label: 'Review Atlassian account security',
    url: 'https://id.atlassian.com/manage-profile/security',
    instructions: 'Review sessions, API tokens, connected apps, and account security settings.',
    category: 'Productivity',
    highValue: true
  },
  'zoom.us': {
    label: 'Review Zoom profile settings',
    url: 'https://zoom.us/profile',
    instructions: 'Review profile security, signed-in devices, connected apps, and meeting integrations.',
    category: 'Productivity',
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

export function getProviderCategory(siteKey: string): ProviderCategory | undefined {
  return PROVIDERS[siteKey]?.category;
}

export function getKnownProviderSiteKeys(): string[] {
  return Object.keys(PROVIDERS).sort();
}
