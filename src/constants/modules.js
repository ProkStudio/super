/** Платформы и навигация по модулям (YouTube / TikTok / …). */

export const PLATFORMS = [
  { id: 'youtube', labelKey: 'platform.youtube', enabled: true },
  { id: 'tiktok', labelKey: 'platform.tiktok', enabled: true },
  { id: 'instagram', labelKey: 'platform.instagram', enabled: false },
  { id: 'telegram', labelKey: 'platform.telegram', enabled: false },
];

export const YOUTUBE_NAV_ITEMS = [
  { id: 'profiles', group: 'workspace', shortcut: '1' },
  { id: 'accounts', group: 'workspace', shortcut: '2' },
  { id: 'automation', group: 'workspace', shortcut: '3' },
  { id: 'tasks', group: 'workspace', shortcut: '4' },
  { id: 'jokes', group: 'content', shortcut: '5' },
  { id: 'uniqueizer', group: 'content', shortcut: '6' },
  { id: 'results', group: 'analytics', shortcut: '7' },
  { id: 'analytics', group: 'analytics', shortcut: '8' },
  { id: 'settings', group: 'bottom', shortcut: '9' },
];

export const TIKTOK_NAV_ITEMS = [
  { id: 'profiles', group: 'workspace', shortcut: '1' },
  { id: 'accounts', group: 'workspace', shortcut: '2' },
  { id: 'automation', group: 'workspace', shortcut: '3' },
  { id: 'results', group: 'analytics', shortcut: '4' },
  { id: 'settings', group: 'bottom', shortcut: '9' },
];

export const MODULE_ACCENTS = {
  youtube: null,
  tiktok: {
    primary: '#d4af37',
    accent: '#d4af37',
    glow: 'rgba(212, 175, 55, 0.25)',
  },
  instagram: {
    primary: '#e1306c',
    accent: '#e1306c',
    glow: 'rgba(225, 48, 108, 0.25)',
  },
  telegram: {
    primary: '#29b6f6',
    accent: '#29b6f6',
    glow: 'rgba(41, 182, 246, 0.25)',
  },
};

export function getNavItems(activeModule) {
  if (activeModule === 'tiktok') return TIKTOK_NAV_ITEMS;
  return YOUTUBE_NAV_ITEMS;
}

export function getDefaultPage(activeModule) {
  return 'profiles';
}
