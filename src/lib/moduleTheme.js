import { applyThemeToDom } from './theme';
import { MODULE_ACCENTS } from '../constants/modules';

/**
 * Применяет акцент модуля (TikTok = золотой) поверх базовых настроек темы.
 */
export function applyModuleTheme(activeModule, baseSettings) {
  const root = document.documentElement;
  root.setAttribute('data-module', activeModule || 'youtube');

  const accent = MODULE_ACCENTS[activeModule];
  if (!accent || !baseSettings) {
    if (baseSettings) applyThemeToDom(baseSettings);
    return;
  }

  const merged = {
    ...baseSettings,
    colors: {
      ...baseSettings.colors,
      primary: accent.primary,
      accent: accent.accent,
    },
    accent: accent.accent,
  };

  applyThemeToDom(merged);
  root.style.setProperty('--nexus-accent-glow', accent.glow);
}
