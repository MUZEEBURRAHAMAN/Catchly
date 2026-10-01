// Service catalog - the content moat.
// Each entry maps statement descriptors and domains to a canonical service.
// Includes: real cancel URL, default price, category, color for UI.
// EXPANSION POINT: Add entries weekly as users report missing services.

export const SERVICES = {
  netflix: {
    name: 'Netflix',
    logo: 'logos/netflix.svg',
    cdnSlug: 'netflix',
    category: 'Streaming',
    domains: ['netflix.com'],
    aliases: ['netflix.com/bill', 'netflix 866-579', 'netflix premium', 'netflix standard', 'netflix basic'],
    defaultPrice: 15.49,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://www.netflix.com/cancelplan',
    cancelSteps: [
      'Sign in if prompted',
      'Click "Finish Cancellation"',
      'You\'ll keep access until the end of the billing period'
    ],
    color: '#E50914',
    plans: [
      { name: 'Standard with ads', price: 7.99 },
      { name: 'Standard', price: 17.99 },
      { name: 'Premium', price: 24.99 }
    ]
  },
  spotify: {
    name: 'Spotify',
    logo: 'logos/spotify.svg',
    cdnSlug: 'spotify',
    category: 'Music',
    domains: ['spotify.com'],
    aliases: ['spotify usa', 'spotify p', 'spotify premium'],
    defaultPrice: 11.99,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://www.spotify.com/account/subscription/',
    cancelSteps: [
      'Sign in to your account',
      'Click "Available Plans"',
      'Scroll to Spotify Free and click "Cancel Premium"'
    ],
    color: '#1DB954',
    plans: [
      { name: 'Individual', price: 11.99 },
      { name: 'Duo', price: 16.99 },
      { name: 'Family', price: 19.99 },
      { name: 'Student', price: 5.99 }
    ]
  },
  disneyplus: {
    name: 'Disney+',
    logo: 'logos/disneyplus.svg',
    // Simple Icons removed Disney+ over trademark concerns; fall back to monogram.
    cdnSlug: null,
    category: 'Streaming',
    domains: ['disneyplus.com', 'disney.com'],
    aliases: ['disney plus', 'disneyplus', 'disney+'],
    defaultPrice: 9.99,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://www.disneyplus.com/account/subscription',
    cancelSteps: [
      'Log in to your Disney+ account',
      'Go to "Subscription" section',
      'Click "Cancel Subscription" under your current plan'
    ],
    color: '#0E47A1'
  },
  max: {
    name: 'Max (HBO)',
    logo: 'logos/max.svg',
    cdnSlug: 'max',
    category: 'Streaming',
    domains: ['max.com', 'hbomax.com'],
    aliases: ['max.com', 'hbo max', 'warnermediadirect'],
    defaultPrice: 9.99,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://auth.max.com/subscription',
    cancelSteps: [
      'Sign in to Max',
      'Go to "Manage Subscription"',
      'Click "Cancel Subscription"'
    ],
    color: '#002BE7'
  },
  hulu: {
    name: 'Hulu',
    logo: 'logos/hulu.svg',
    // Simple Icons removed Hulu over trademark concerns; fall back to monogram.
    cdnSlug: null,
    category: 'Streaming',
    domains: ['hulu.com'],
    aliases: ['hulu.com', 'hulu llc'],
    defaultPrice: 9.99,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://secure.hulu.com/account/cancel',
    cancelSteps: [
      'Log in at hulu.com/account',
      'Click "Cancel Your Subscription" at the bottom',
      'Follow the cancellation prompts'
    ],
    color: '#1CE783'
  },
  primevideo: {
    name: 'Amazon Prime',
    logo: 'logos/primevideo.svg',
    // Simple Icons removed Prime Video over trademark concerns; fall back to monogram.
    cdnSlug: null,
    category: 'Streaming',
    domains: ['amazon.com', 'primevideo.com'],
    aliases: ['amazon prime', 'amzn prime', 'prime video'],
    defaultPrice: 14.99,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://www.amazon.com/gp/your-account/manage-prime',
    cancelSteps: [
      'Go to "Your Account" → "Prime Membership"',
      'Click "Update, cancel and more"',
      'Select "End membership"'
    ],
    color: '#FF9900'
  },
  appletv: {
    name: 'Apple TV+',
    logo: 'logos/appletv.svg',
    cdnSlug: 'appletv',
    category: 'Streaming',
    domains: ['tv.apple.com'],
    aliases: ['apple.com/bill', 'apple tv plus', 'apple tv+'],
    defaultPrice: 9.99,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://tv.apple.com/settings',
    cancelSteps: [
      'Apple subscriptions are managed in Settings on iPhone/Mac, not online.',
      'iPhone: Settings → [your name] → Subscriptions → Apple TV+ → Cancel',
      'Mac: App Store → click your name → View Information → Manage'
    ],
    color: '#000000'
  },
  applemusic: {
    name: 'Apple Music',
    logo: 'logos/applemusic.svg',
    cdnSlug: 'applemusic',
    category: 'Music',
    domains: ['music.apple.com'],
    aliases: ['apple.com/bill', 'apple music'],
    defaultPrice: 10.99,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://music.apple.com/account/subscriptions',
    cancelSteps: [
      'iPhone/iPad: Settings → [your name] → Subscriptions',
      'Mac: App Store → click name → View Information',
      'Tap Apple Music → Cancel Subscription'
    ],
    color: '#FA243C'
  },
  youtubepremium: {
    name: 'YouTube Premium',
    logo: 'logos/youtubepremium.svg',
    cdnSlug: 'youtube',
    category: 'Streaming',
    domains: ['youtube.com'],
    aliases: ['google *youtube', 'youtube premium', 'youtube music'],
    defaultPrice: 13.99,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://www.youtube.com/paid_memberships',
    cancelSteps: [
      'Go to youtube.com/paid_memberships',
      'Find YouTube Premium → "Deactivate"',
      'Choose "Continue to cancel"'
    ],
    color: '#FF0000'
  },
  chatgpt: {
    name: 'ChatGPT Plus',
    logo: 'logos/chatgpt.svg',
    // Simple Icons removed OpenAI/ChatGPT over trademark concerns; fall back to monogram.
    cdnSlug: null,
    category: 'AI',
    domains: ['chatgpt.com', 'openai.com'],
    aliases: ['openai *chatgpt', 'openai subscr'],
    defaultPrice: 20.00,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://chatgpt.com/#settings/Billing',
    cancelSteps: [
      'Open ChatGPT → Settings → Billing',
      'Click "Manage subscription"',
      'Cancel via the Stripe portal that opens'
    ],
    color: '#10A37F'
  },
  claude: {
    name: 'Claude Pro',
    logo: 'logos/claude.svg',
    cdnSlug: 'anthropic',
    category: 'AI',
    domains: ['claude.ai', 'anthropic.com'],
    aliases: ['anthropic *claude', 'claude.ai'],
    defaultPrice: 20.00,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://claude.ai/settings/billing',
    cancelSteps: [
      'Go to claude.ai → Settings → Billing',
      'Click "Manage subscription"',
      'Choose "Cancel plan"'
    ],
    color: '#D97757'
  },
  notion: {
    name: 'Notion',
    logo: 'logos/notion.svg',
    cdnSlug: 'notion',
    category: 'Productivity',
    domains: ['notion.so', 'notion.com'],
    aliases: ['notion labs'],
    defaultPrice: 10.00,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://www.notion.so/my-account',
    cancelSteps: [
      'Open Notion → Settings & Members',
      'Go to "Billing" tab',
      'Click "Cancel subscription"'
    ],
    color: '#000000'
  },
  grammarly: {
    name: 'Grammarly Premium',
    logo: 'logos/grammarly.svg',
    cdnSlug: 'grammarly',
    category: 'Productivity',
    domains: ['grammarly.com'],
    aliases: ['grammarly inc', 'grammarly prem'],
    defaultPrice: 12.00,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://account.grammarly.com/subscription',
    cancelSteps: [
      'Sign in at account.grammarly.com',
      'Click "Subscription" in the sidebar',
      'Click "Cancel Subscription" at the bottom'
    ],
    color: '#15C39A'
  },
  dropbox: {
    name: 'Dropbox',
    logo: 'logos/dropbox.svg',
    cdnSlug: 'dropbox',
    category: 'Storage',
    domains: ['dropbox.com'],
    aliases: ['dropbox*', 'dropbox plus'],
    defaultPrice: 11.99,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://www.dropbox.com/account/plan',
    cancelSteps: [
      'Sign in to dropbox.com',
      'Click avatar → Settings → Plan',
      'Click "Cancel plan"'
    ],
    color: '#0061FF'
  },
  onepassword: {
    name: '1Password',
    logo: 'logos/onepassword.svg',
    cdnSlug: '1password',
    category: 'Security',
    domains: ['1password.com'],
    aliases: ['1password', 'agilebits'],
    defaultPrice: 2.99,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://my.1password.com/billing',
    cancelSteps: [
      'Sign in at my.1password.com',
      'Click "Billing" in the sidebar',
      'Click "Cancel plan"'
    ],
    color: '#0572EC'
  },
  adobecc: {
    name: 'Adobe Creative Cloud',
    logo: 'logos/adobecc.svg',
    // Simple Icons removed Adobe over trademark concerns; fall back to monogram.
    cdnSlug: null,
    category: 'Design',
    domains: ['adobe.com'],
    aliases: ['adobe *creative', 'adobe systems', 'adobe inc'],
    defaultPrice: 59.99,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://account.adobe.com/plans',
    cancelSteps: [
      'Sign in at account.adobe.com',
      'Go to "Plans" → "Manage plan"',
      'Click "Cancel your plan" (early termination fees may apply)'
    ],
    color: '#FA0F00'
  },
  audible: {
    name: 'Audible',
    logo: 'logos/audible.svg',
    cdnSlug: 'audible',
    category: 'Audio',
    domains: ['audible.com'],
    aliases: ['audible*', 'audible.com'],
    defaultPrice: 14.95,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://www.audible.com/account/membership-details',
    cancelSteps: [
      'Sign in at audible.com',
      'Account Details → Cancel membership',
      'You keep your library after cancellation'
    ],
    color: '#F8991C'
  },
  nyt: {
    name: 'New York Times',
    logo: 'logos/nyt.svg',
    cdnSlug: 'newyorktimes',
    category: 'News',
    domains: ['nytimes.com'],
    aliases: ['nyt*', 'new york times', 'nytimes'],
    defaultPrice: 17.00,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://myaccount.nytimes.com/seg/subscription',
    cancelSteps: [
      'Go to myaccount.nytimes.com',
      'Click "Manage Subscription" → "Cancel"',
      'NYT will try to retain you with offers — keep clicking through'
    ],
    color: '#000000'
  },
  github: {
    name: 'GitHub',
    logo: 'logos/github.svg',
    cdnSlug: 'github',
    category: 'Developer',
    domains: ['github.com'],
    aliases: ['github *', 'github inc'],
    defaultPrice: 4.00,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://github.com/settings/billing/plans',
    cancelSteps: [
      'Go to github.com/settings/billing',
      'Click "Edit" next to your plan',
      'Select "Free" plan and downgrade'
    ],
    color: '#181717'
  },
  figma: {
    name: 'Figma',
    logo: 'logos/figma.svg',
    cdnSlug: 'figma',
    category: 'Design',
    domains: ['figma.com'],
    aliases: ['figma*', 'figma inc'],
    defaultPrice: 15.00,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://www.figma.com/settings/account',
    cancelSteps: [
      'Sign in to Figma',
      'Settings → Plan and Billing',
      'Click "Downgrade to Starter" or "Cancel"'
    ],
    color: '#F24E1E'
  },
  googleone: {
    name: 'Google One',
    logo: 'logos/googleone.svg',
    cdnSlug: 'google',
    category: 'Productivity',
    domains: ['one.google.com'],
    aliases: ['google one', 'google storage', 'google drive'],
    defaultPrice: 2.99,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://one.google.com/settings',
    cancelSteps: [
      'Go to Google One Settings',
      'Select "Cancel membership"',
      'Confirm cancellation'
    ],
    color: '#4285F4'
  },
  icloud: {
    name: 'iCloud+ / Apple One',
    logo: 'logos/icloud.svg',
    cdnSlug: 'apple',
    category: 'Productivity',
    domains: ['icloud.com', 'apple.com'],
    aliases: ['icloud', 'icloud+', 'apple one', 'apple storage'],
    defaultPrice: 2.99,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://support.apple.com/HT207594',
    cancelSteps: [
      'Open Settings on your Apple device or visit Apple ID settings',
      'Select your name > Subscriptions',
      'Choose the subscription and tap "Cancel Subscription"'
    ],
    color: '#0070C9'
  },
  m365: {
    name: 'Microsoft 365',
    logo: 'logos/m365.svg',
    cdnSlug: 'microsoft',
    category: 'Productivity',
    domains: ['microsoft.com', 'office.com', 'live.com'],
    aliases: ['microsoft 365', 'office 365', 'msft *microsoft 365'],
    defaultPrice: 9.99,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://account.microsoft.com/services',
    cancelSteps: [
      'Sign in to your Microsoft account Services page',
      'Find Microsoft 365 and click "Manage"',
      'Select "Cancel subscription"'
    ],
    color: '#D83B01'
  },
  canva: {
    name: 'Canva Pro',
    logo: 'logos/canva.svg',
    cdnSlug: 'canva',
    category: 'Design',
    domains: ['canva.com'],
    aliases: ['canva pro', 'canva teams', 'canva'],
    defaultPrice: 12.99,
    cycle: 'monthly',
    currency: 'USD',
    cancelUrl: 'https://www.canva.com/settings/billing-and-teams',
    cancelSteps: [
      'Go to Canva Account Settings > Billing & Teams',
      'Find your subscription under Subscriptions for your team',
      'Click "Cancel subscription"'
    ],
    color: '#00C4CC'
  }
};

// Normalize a merchant string from a checkout page or descriptor to a service key.
// Returns { key, service } or null.
export function normalizeServiceName(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();

  for (const [key, svc] of Object.entries(SERVICES)) {
    // Match canonical name
    if (lower.includes(svc.name.toLowerCase())) {
      return { key, service: svc };
    }
    // Match domains
    for (const d of svc.domains) {
      if (lower.includes(d)) return { key, service: svc };
    }
    // Match aliases
    if (svc.aliases) {
      for (const a of svc.aliases) {
        if (lower.includes(a.toLowerCase())) return { key, service: svc };
      }
    }
  }
  return null;
}

// Try to identify a service from the current page (URL + title).
export function identifyFromPage(url, title) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    for (const [key, svc] of Object.entries(SERVICES)) {
      if (svc.domains.some(d => hostname === d || hostname.endsWith('.' + d))) {
        return { key, service: svc };
      }
    }
  } catch {}
  return normalizeServiceName(title);
}

// Get a list view of all known services (for the "add subscription" search).
export function listServices() {
  return Object.entries(SERVICES).map(([key, svc]) => ({
    key,
    name: svc.name,
    category: svc.category,
    color: svc.color,
    logo: svc.logo,
    cdnSlug: svc.cdnSlug,
    defaultPrice: svc.defaultPrice,
    cycle: svc.cycle
  }));
}
