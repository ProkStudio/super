import { create } from 'zustand';
import { applyThemeToDom } from '../lib/theme';
import { applyModuleTheme } from '../lib/moduleTheme';
import {
  YOUTUBE_NAV_ITEMS,
  getNavItems,
  getDefaultPage,
} from '../constants/modules';

/** @deprecated use getNavItems(activeModule) */
export const NAV_ITEMS = YOUTUBE_NAV_ITEMS;

let cachedBaseSettings = null;

export const useAppStore = create((set, get) => ({
  activePage: 'profiles',
  activeModule: 'youtube',
  moduleLastRoute: {},
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  hotkeysOpen: false,
  helpOpen: false,
  settingsSubPage: null,
  theme: 'dark',
  accent: '#a855f7',
  font: 'JetBrains Mono',
  fontSize: 16,
  locale: 'ru',
  selectedProfileIds: [],
  mostloginOnline: false,
  toast: null,

  setActivePage: (page) => set({ activePage: page, settingsSubPage: null }),

  setActiveModule: async (module) => {
    const state = get();
    if (module === state.activeModule) return;

    const moduleLastRoute = {
      ...state.moduleLastRoute,
      [state.activeModule]: state.activePage,
    };
    const nextPage = state.moduleLastRoute[module] || getDefaultPage(module);

    set({
      activeModule: module,
      moduleLastRoute,
      activePage: nextPage,
      settingsSubPage: null,
    });

    if (cachedBaseSettings) {
      applyModuleTheme(module, cachedBaseSettings);
    }

    try {
      await window.nexusAPI?.updateSettings({ activeModule: module, moduleLastRoute });
    } catch {
      /* dev without electron */
    }
  },

  hydrateModule: (settings) => {
    cachedBaseSettings = settings;
    const activeModule = settings.activeModule || 'youtube';
    const moduleLastRoute = settings.moduleLastRoute || {};
    const activePage = moduleLastRoute[activeModule] || getDefaultPage(activeModule);
    set({ activeModule, moduleLastRoute, activePage });
    applyModuleTheme(activeModule, settings);
  },

  toggleSidebar: async () => {
    const next = !get().sidebarCollapsed;
    set({ sidebarCollapsed: next });
    try {
      await window.nexusAPI?.updateSettings({ sidebarCollapsed: next });
    } catch {
      /* dev without electron */
    }
  },
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
  setHotkeysOpen: (v) => set({ hotkeysOpen: v }),
  setHelpOpen: (v) => set({ helpOpen: v }),
  setSettingsSubPage: (page) => set({ settingsSubPage: page, activePage: 'settings' }),
  applyTheme: (partial) => {
    const current = get();
    const merged = {
      theme: current.theme,
      colorPreset: 'purple',
      colors: {
        primary: current.accent,
        accent: current.accent,
        background: '#0a0a0a',
        secondary: '#111111',
        sidebar: '#0d0d0d',
      },
      font: current.font,
      fontSize: current.fontSize,
      locale: current.locale,
      activeModule: current.activeModule,
      moduleLastRoute: current.moduleLastRoute,
      ...partial,
    };
    cachedBaseSettings = merged;
    const applied = applyThemeToDom(merged);
    applyModuleTheme(get().activeModule, merged);
    set({
      theme: applied.theme,
      accent: applied.colors.accent,
      font: applied.font,
      fontSize: applied.fontSize,
      locale: applied.locale,
    });
  },
  setSelectedProfileIds: (ids) => set({ selectedProfileIds: ids }),
  setMostloginOnline: (v) => set({ mostloginOnline: v }),
  showToast: (message, type = 'success') => set({ toast: { message, type } }),
  clearToast: () => set({ toast: null }),
}));

export function useNavItems() {
  const activeModule = useAppStore((s) => s.activeModule);
  return getNavItems(activeModule);
}
