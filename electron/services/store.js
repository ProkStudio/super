/**
 * TechPro — unified electron-store with encrypted secrets.
 */
const Store = require('electron-store');
const { safeStorage } = require('electron');

const DEFAULT_SETTINGS = {
  theme: 'dark',
  colorPreset: 'purple',
  accent: '#a855f7',
  colors: {
    primary: '#a855f7',
    accent: '#a855f7',
    background: '#0a0a0a',
    secondary: '#111111',
    sidebar: '#0d0d0d',
  },
  font: 'JetBrains Mono',
  customFontPath: '',
  customFontName: '',
  fontSize: 16,
  locale: 'ru',
  sidebarCollapsed: false,
  ffmpegPath: '',
  mostloginUrl: 'http://127.0.0.1:30898',
  visionLocalUrl: 'http://127.0.0.1:3030',
  zennoUrl: 'http://127.0.0.1:8160',
  browserProvider: 'mostlogin',
  autoChecker: {
    enabled: false,
    intervalHours: 6,
    telegramNotify: true,
    notifyBansOnly: false,
    blockScope: 'all',
  },
  autoBackup: { enabled: false, intervalDays: 7, maxFiles: 5, folder: '', lastBackup: null },
  autoUpdate: {
    enabled: false,
    checkOnStartup: true,
    dismissedVersion: null,
    dismissedChangelogVersion: null,
  },
  statsCollector: {
    enabled: false,
    intervalHours: 1,
    daysRange: 30,
    telegramNotify: false,
    lastSnapshot: null,
  },
  hotkeys: {
    search: 'Ctrl+K',
    sidebar: 'Ctrl+B',
    savePreset: 'Ctrl+Shift+S',
  },
  activeModule: 'youtube',
  moduleLastRoute: {},
  aiBaseUrl: 'https://openrouter.ai/api/v1',
  aiModel: 'meta-llama/llama-3.2-3b-instruct:free',
};

const store = new Store({
  name: 'nexus-toolkit',
  defaults: {
    settings: DEFAULT_SETTINGS,
    secrets: {},
    profiles: { selectedIds: [], meta: {} },
    accounts: { blocks: [], temp: [] },
    automationPresets: [],
    tasks: { active: [], archive: [] },
    results: { blocks: [], trash: [] },
    analyticsCache: { lastUpdated: null, totals: null, topVideos: [] },
    deadProxies: [],
    tiktok: {
      commentStats: [],
      repliedKeys: [],
      automation: { running: false, mode: null, logs: [] },
    },
    automationDrafts: {},
  },
});

function encryptValue(value) {
  if (!value) return null;
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64');
  }
  return Buffer.from(value, 'utf8').toString('base64');
}

function decryptValue(encrypted) {
  if (!encrypted) return null;
  try {
    const buf = Buffer.from(encrypted, 'base64');
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buf);
    }
    return buf.toString('utf8');
  } catch {
    return null;
  }
}

function getSecret(key) {
  const encrypted = store.get(`secrets.${key}`);
  return decryptValue(encrypted);
}

function setSecret(key, value) {
  if (!value) {
    store.delete(`secrets.${key}`);
    return;
  }
  store.set(`secrets.${key}`, encryptValue(value));
}

function hasSecret(key) {
  return !!store.get(`secrets.${key}`);
}

function getSettings() {
  return { ...DEFAULT_SETTINGS, ...store.get('settings', {}) };
}

function updateSettings(partial) {
  const current = getSettings();
  store.set('settings', { ...current, ...partial });
  return getSettings();
}

function getProfiles() {
  return store.get('profiles', { selectedIds: [], meta: {} });
}

function setProfiles(data) {
  store.set('profiles', data);
}

function getAccounts() {
  return store.get('accounts', { blocks: [], temp: [] });
}

function setAccounts(data) {
  store.set('accounts', data);
}

function getAutomationPresets() {
  return store.get('automationPresets', []);
}

function saveAutomationPreset(preset) {
  const presets = getAutomationPresets();
  const idx = presets.findIndex(
    (p) => p.id === preset.id || (preset.name && p.name === preset.name)
  );
  if (idx >= 0) presets[idx] = { ...presets[idx], ...preset, id: presets[idx].id };
  else presets.push(preset);
  store.set('automationPresets', presets);
  return presets;
}

function deleteAutomationPreset(id) {
  const presets = getAutomationPresets().filter((p) => p.id !== id);
  store.set('automationPresets', presets);
  return presets;
}

function getTasks() {
  return store.get('tasks', { active: [], archive: [] });
}

function setTasks(data) {
  store.set('tasks', data);
}

function getResults() {
  return store.get('results', { blocks: [], trash: [] });
}

function setResults(data) {
  store.set('results', data);
}

function getAnalyticsCache() {
  return store.get('analyticsCache');
}

function setAnalyticsCache(data) {
  store.set('analyticsCache', data);
}

function getDeadProxies() {
  return store.get('deadProxies', []);
}

function getTiktok() {
  return store.get('tiktok', {
    commentStats: [],
    repliedKeys: [],
    automation: { running: false, mode: null, logs: [] },
  });
}

function setTiktok(data) {
  store.set('tiktok', data);
}

const AUTOMATION_DRAFT_DEFAULTS = {
  youtube: {
    selectedProfileIds: [],
    mode: 'warmup',
    threads: 2,
    config: {},
  },
  tiktok: {
    selectedProfileIds: [],
    mode: 'warmup',
    threads: 2,
    config: {},
  },
};

function getAutomationDraft(module) {
  const key = module === 'tiktok' ? 'tiktok' : 'youtube';
  const drafts = store.get('automationDrafts', {});
  const defaults = AUTOMATION_DRAFT_DEFAULTS[key] || AUTOMATION_DRAFT_DEFAULTS.youtube;
  return { ...defaults, ...(drafts[key] || {}) };
}

function updateAutomationDraft(module, partial) {
  const key = module === 'tiktok' ? 'tiktok' : 'youtube';
  const drafts = store.get('automationDrafts', {});
  drafts[key] = {
    ...getAutomationDraft(module),
    ...partial,
    updatedAt: new Date().toISOString(),
  };
  store.set('automationDrafts', drafts);
  return drafts[key];
}

function updateProfileSelection(selectedIds) {
  const cur = getProfiles();
  const ids = Array.isArray(selectedIds) ? selectedIds.map(String) : [];
  store.set('profiles', { ...cur, selectedIds: ids });
  return ids;
}

function setDeadProxies(list) {
  store.set('deadProxies', list);
}

function exportAll() {
  return {
    version: '2.0.2',
    exportedAt: new Date().toISOString(),
    settings: getSettings(),
    profiles: getProfiles(),
    accounts: getAccounts(),
    automationPresets: getAutomationPresets(),
    tasks: getTasks(),
    results: getResults(),
    analyticsCache: getAnalyticsCache(),
    deadProxies: getDeadProxies(),
    tiktok: getTiktok(),
    automationDrafts: store.get('automationDrafts', {}),
  };
}

function importAll(data, merge = true) {
  if (!data) return { ok: false, error: 'Invalid backup' };
  if (data.settings) updateSettings(data.settings);
  if (data.profiles) {
    if (merge) {
      const cur = getProfiles();
      store.set('profiles', {
        selectedIds: data.profiles.selectedIds || cur.selectedIds,
        meta: { ...cur.meta, ...data.profiles.meta },
      });
    } else store.set('profiles', data.profiles);
  }
  if (data.accounts) {
    if (merge) {
      const cur = getAccounts();
      store.set('accounts', {
        blocks: [...cur.blocks, ...(data.accounts.blocks || [])],
        temp: data.accounts.temp || cur.temp,
      });
    } else store.set('accounts', data.accounts);
  }
  if (data.automationPresets) {
    if (merge) {
      const existing = getAutomationPresets();
      const ids = new Set(existing.map((p) => p.id));
      const merged = [...existing, ...(data.automationPresets || []).filter((p) => !ids.has(p.id))];
      store.set('automationPresets', merged);
    } else store.set('automationPresets', data.automationPresets);
  }
  if (data.tasks) store.set('tasks', data.tasks);
  if (data.results) {
    if (merge) {
      const cur = getResults();
      store.set('results', {
        blocks: [...cur.blocks, ...(data.results.blocks || [])],
        trash: [...cur.trash, ...(data.results.trash || [])],
      });
    } else store.set('results', data.results);
  }
  if (data.analyticsCache) store.set('analyticsCache', data.analyticsCache);
  if (data.deadProxies) store.set('deadProxies', data.deadProxies);
  if (data.tiktok) store.set('tiktok', data.tiktok);
  if (data.automationDrafts) {
    if (merge) {
      const cur = store.get('automationDrafts', {});
      store.set('automationDrafts', { ...cur, ...data.automationDrafts });
    } else {
      store.set('automationDrafts', data.automationDrafts);
    }
  }
  return { ok: true };
}

function resetSettings() {
  store.set('settings', { ...DEFAULT_SETTINGS });
  return getSettings();
}

function isSafeStorageAvailable() {
  return safeStorage.isEncryptionAvailable();
}

module.exports = {
  store,
  getSecret,
  setSecret,
  hasSecret,
  getSettings,
  updateSettings,
  getProfiles,
  setProfiles,
  getAccounts,
  setAccounts,
  getAutomationPresets,
  saveAutomationPreset,
  deleteAutomationPreset,
  getTasks,
  setTasks,
  getResults,
  setResults,
  getAnalyticsCache,
  setAnalyticsCache,
  getDeadProxies,
  setDeadProxies,
  getTiktok,
  setTiktok,
  getAutomationDraft,
  updateAutomationDraft,
  updateProfileSelection,
  exportAll,
  importAll,
  resetSettings,
  isSafeStorageAvailable,
  DEFAULT_SETTINGS,
};
