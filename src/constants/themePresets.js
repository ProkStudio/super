export const THEME_PRESETS = [
  {
    id: 'blue',
    color: '#3b82f6',
    colors: {
      primary: '#3b82f6',
      accent: '#60a5fa',
      background: '#0a0a12',
      secondary: '#111827',
      sidebar: '#0c0c14',
    },
    lightColors: {
      primary: '#2563eb',
      accent: '#3b82f6',
      background: '#f0f4ff',
      secondary: '#ffffff',
      sidebar: '#e8eeff',
    },
  },
  {
    id: 'purple',
    color: '#a855f7',
    colors: {
      primary: '#a855f7',
      accent: '#c084fc',
      background: '#0a0a0a',
      secondary: '#111111',
      sidebar: '#0d0d0d',
    },
    lightColors: {
      primary: '#9333ea',
      accent: '#a855f7',
      background: '#f4f4f5',
      secondary: '#ffffff',
      sidebar: '#ede9fe',
    },
  },
  {
    id: 'green',
    color: '#22c55e',
    colors: {
      primary: '#22c55e',
      accent: '#4ade80',
      background: '#0a0f0a',
      secondary: '#111811',
      sidebar: '#0c120c',
    },
    lightColors: {
      primary: '#16a34a',
      accent: '#22c55e',
      background: '#f0fdf4',
      secondary: '#ffffff',
      sidebar: '#dcfce7',
    },
  },
  {
    id: 'red',
    color: '#ef4444',
    colors: {
      primary: '#ef4444',
      accent: '#f87171',
      background: '#0f0a0a',
      secondary: '#181111',
      sidebar: '#120c0c',
    },
    lightColors: {
      primary: '#dc2626',
      accent: '#ef4444',
      background: '#fef2f2',
      secondary: '#ffffff',
      sidebar: '#fee2e2',
    },
  },
  {
    id: 'orange',
    color: '#f97316',
    colors: {
      primary: '#f97316',
      accent: '#fb923c',
      background: '#0f0c0a',
      secondary: '#181411',
      sidebar: '#120e0c',
    },
    lightColors: {
      primary: '#ea580c',
      accent: '#f97316',
      background: '#fff7ed',
      secondary: '#ffffff',
      sidebar: '#ffedd5',
    },
  },
  {
    id: 'teal',
    color: '#14b8a6',
    colors: {
      primary: '#14b8a6',
      accent: '#2dd4bf',
      background: '#0a0f0e',
      secondary: '#111816',
      sidebar: '#0c1211',
    },
    lightColors: {
      primary: '#0d9488',
      accent: '#14b8a6',
      background: '#f0fdfa',
      secondary: '#ffffff',
      sidebar: '#ccfbf1',
    },
  },
  {
    id: 'magenta',
    color: '#ec4899',
    colors: {
      primary: '#ec4899',
      accent: '#00ced5',
      background: '#0a0a0a',
      secondary: '#111111',
      sidebar: '#0d0d0d',
    },
    lightColors: {
      primary: '#db2777',
      accent: '#06b6d4',
      background: '#fdf2f8',
      secondary: '#ffffff',
      sidebar: '#fce7f3',
    },
  },
];

export const FONT_OPTIONS = [
  { value: 'JetBrains Mono', label: 'JetBrains Mono (Default)' },
  { value: 'Inter', label: 'Inter' },
  { value: 'Segoe UI', label: 'Segoe UI' },
  { value: 'Consolas', label: 'Consolas' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Georgia', label: 'Georgia' },
];

export const CUSTOM_COLOR_KEYS = ['primary', 'accent', 'background'];

export function getPresetById(id) {
  return THEME_PRESETS.find((p) => p.id === id) || THEME_PRESETS[1];
}

export function getPresetColors(preset, theme = 'dark') {
  return theme === 'light' ? { ...preset.lightColors } : { ...preset.colors };
}

export function normalizeSettings(settings = {}) {
  const preset = getPresetById(settings.colorPreset || 'purple');
  const theme = settings.theme || 'dark';
  const base = getPresetColors(preset, theme);
  const colors = {
    primary: settings.colors?.primary || settings.accent || base.primary,
    accent: settings.colors?.accent || settings.accent || base.accent,
    background: settings.colors?.background || base.background,
    secondary: settings.colors?.secondary || base.secondary,
    sidebar: settings.colors?.sidebar || base.sidebar,
  };

  return {
    theme,
    colorPreset: settings.colorPreset || 'purple',
    colors,
    accent: colors.accent,
    font: settings.font || 'JetBrains Mono',
    customFontPath: settings.customFontPath || '',
    customFontName: settings.customFontName || '',
    fontSize: settings.fontSize ?? 16,
    locale: settings.locale || 'ru',
  };
}

export function countCustomColors(colors, preset, theme) {
  const base = getPresetColors(preset, theme);
  return CUSTOM_COLOR_KEYS.filter((k) => (
    (colors[k] || '').toLowerCase() !== (base[k] || '').toLowerCase()
  )).length;
}
