import { normalizeSettings } from '../constants/themePresets';

let customFontStyleEl = null;

function ensureCustomFontStyle() {
  if (!customFontStyleEl) {
    customFontStyleEl = document.createElement('style');
    customFontStyleEl.id = 'nexus-custom-font';
    document.head.appendChild(customFontStyleEl);
  }
  return customFontStyleEl;
}

function applyCustomFont(customFontPath, customFontName) {
  const root = document.documentElement;
  if (customFontPath) {
    const family = customFontName || 'NexusCustom';
    const url = customFontPath.startsWith('file://')
      ? customFontPath
      : `file:///${customFontPath.replace(/\\/g, '/')}`;
    ensureCustomFontStyle().textContent = `
      @font-face {
        font-family: '${family}';
        src: url('${url}');
      }
    `;
    root.style.setProperty('--nexus-font', `'${family}', monospace`);
    return;
  }
  if (customFontStyleEl) customFontStyleEl.textContent = '';
}

export function applyThemeToDom(rawSettings) {
  const settings = normalizeSettings(rawSettings);
  const root = document.documentElement;
  const isLight = settings.theme === 'light';

  root.setAttribute('data-theme', settings.theme);
  root.setAttribute('data-appearance', settings.colorPreset || 'purple');
  root.style.setProperty('--nexus-primary', settings.colors.primary);
  root.style.setProperty('--nexus-accent', settings.colors.accent);
  root.style.setProperty('--nexus-bg', settings.colors.background);
  root.style.setProperty('--nexus-panel', settings.colors.secondary);
  root.style.setProperty('--nexus-sidebar', settings.colors.sidebar);
  root.style.setProperty(
    '--nexus-card',
    isLight ? '#fafafa' : colorMixDark(settings.colors.secondary, '#141414'),
  );
  root.style.setProperty('--nexus-font-size', `${settings.fontSize}px`);

  if (settings.customFontPath) {
    applyCustomFont(settings.customFontPath, settings.customFontName);
  } else {
    applyCustomFont('');
    const fontStack = settings.font === 'JetBrains Mono'
      ? "'JetBrains Mono', 'Consolas', monospace"
      : `'${settings.font}', system-ui, sans-serif`;
    root.style.setProperty('--nexus-font', fontStack);
  }

  return settings;
}

function colorMixDark(secondary, fallback) {
  return secondary && secondary !== '#ffffff' ? secondary : fallback;
}

export function settingsToPersist(local) {
  const normalized = normalizeSettings(local);
  return {
    theme: normalized.theme,
    colorPreset: normalized.colorPreset,
    colors: normalized.colors,
    accent: normalized.colors.accent,
    font: normalized.font,
    customFontPath: normalized.customFontPath,
    customFontName: normalized.customFontName,
    fontSize: normalized.fontSize,
    locale: normalized.locale,
  };
}
