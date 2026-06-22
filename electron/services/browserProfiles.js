/**
 * Unified anti-detect browser adapter — MostLogin, Vision, Zenno
 */
const store = require('./store');
const mostlogin = require('./mostlogin');
const vision = require('./vision');
const zenno = require('./zenno');
const spaceproxy = require('./spaceproxy');

const CONNECTORS = {
  mostlogin: {
    name: 'MostLogin',
    test: () => mostlogin.testConnection(),
    getFolders: () => mostlogin.getFolderList(1, 200).then((d) => d?.list || d?.data || []),
    getProfiles: async () => {
      const data = await mostlogin.getProfileList(1, 200);
      return data?.list || data?.data || data?.profiles || [];
    },
    open: (id) => mostlogin.openBrowser(id),
    close: (id) => mostlogin.closeBrowser(id),
    delete: (ids) => mostlogin.deleteProfiles(ids),
    createFolder: (p) => mostlogin.createFolder(p),
    moveToFolder: (ids, folderId) => mostlogin.moveProfilesToFolder(ids, folderId),
    bulkCreate: (opts) => mostlogin.bulkCreateProfiles(opts),
    extractError: mostlogin.extractError,
  },
  vision: {
    name: 'Vision',
    test: (key) => vision.testConnection(key),
    getFolders: (key) => vision.getFolderList(key),
    getProfiles: (key, folderId) => vision.getProfileList(key, folderId),
    open: (id, key) => vision.openBrowser(id, key),
    close: (id, key) => vision.closeBrowser(id, key),
    delete: (ids, key) => vision.deleteProfiles(ids, key),
    createFolder: async () => { throw new Error('Создайте папку в Vision Browser'); },
    moveToFolder: async () => { throw new Error('Перемещение профилей Vision пока не поддерживается'); },
    bulkCreate: (opts) => vision.bulkCreateProfiles(opts),
    extractError: vision.extractError,
  },
  zenno: {
    name: 'ZennoBrowser',
    test: (key) => zenno.testConnection(key),
    getFolders: (key) => zenno.getFolderList(key),
    getProfiles: (key, folderId) => zenno.getProfileList(key, folderId),
    open: (id, key) => zenno.openBrowser(id, key),
    close: (id, key) => zenno.closeBrowser(id, key),
    delete: (ids, key) => zenno.deleteProfiles(ids, key),
    createFolder: async () => { throw new Error('Создайте папку в ZennoBrowser'); },
    moveToFolder: async () => { throw new Error('Перемещение профилей Zenno пока не поддерживается'); },
    bulkCreate: (opts) => zenno.bulkCreateProfiles(opts),
    extractError: zenno.extractError,
  },
};

function resolveBrowserType(type) {
  const settings = store.getSettings();
  const t = type || settings.browserProvider || 'mostlogin';
  if (!CONNECTORS[t]) throw new Error(`Неизвестный браузер: ${t}`);
  return t;
}

function getApiKey(browserType) {
  const map = {
    mostlogin: 'mostloginKey',
    vision: 'visionKey',
    zenno: 'zennoKey',
  };
  return store.getSecret(map[browserType] || 'mostloginKey');
}

function connector(browserType) {
  return CONNECTORS[resolveBrowserType(browserType)];
}

function normalizeProfileProxy(raw) {
  if (!raw) return null;
  if (typeof raw === 'object' && raw.host) {
    return {
      host: raw.host,
      port: raw.port,
      username: raw.username || raw.proxyUsername || '',
      password: raw.password || raw.proxyPassword || '',
      type: raw.type || raw.protocol || 'http',
    };
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = spaceproxy.parseProxyLine(
      raw.replace(/^socks5:\/\//i, '').replace(/^https?:\/\//i, '').replace(/^[^@]+@/, ''),
    );
    return parsed;
  }
  return null;
}

function enrichProfiles(list, browserType) {
  const meta = store.getProfiles().meta || {};
  return list.map((p) => {
    const id = p.id || p.profileId;
    const m = meta[id] || {};
    const rawFolder = p.profileFolder || null;
    const folderId = rawFolder?.id ?? p.folderId ?? p.folder_id;
    const profileFolder = rawFolder
      ? {
          ...rawFolder,
          id: folderId != null ? String(folderId) : undefined,
          folderName: rawFolder.folderName || rawFolder.folder_name || rawFolder.name,
        }
      : (folderId != null ? { id: String(folderId), folderName: p.folderName || p.folder_name || '' } : null);
    return {
      ...p,
      id: id != null ? String(id) : id,
      browserType,
      profileFolder,
      folderId: folderId != null ? String(folderId) : null,
      proxy: normalizeProfileProxy(p.proxy),
      localStatus: m.status || 'none',
      channelName: m.channelName || p.title || '',
      notes: m.notes || '',
      linkedAccountId: m.linkedAccountId || null,
      linkedEmail: m.linkedEmail || null,
    };
  });
}

async function testConnection(browserType) {
  const type = resolveBrowserType(browserType);
  const key = getApiKey(type);
  if (type !== 'mostlogin' && !key) {
    return { ok: false, error: `API ключ ${CONNECTORS[type].name} не задан` };
  }
  return CONNECTORS[type].test(key);
}

async function listProfiles(browserType) {
  const type = resolveBrowserType(browserType);
  const key = getApiKey(type);
  const list = await CONNECTORS[type].getProfiles(key);
  return enrichProfiles(list, type);
}

async function listFolders(browserType) {
  const type = resolveBrowserType(browserType);
  const key = getApiKey(type);
  const folders = await CONNECTORS[type].getFolders(key);
  return folders.map((f) => ({
    id: f.id != null ? String(f.id) : f.id,
    folderName: f.folderName || f.folder_name || f.name,
    folderColor: f.folderColor || f.folder_color,
    resourceCount: f.resourceCount ?? f.profileCount ?? f.count ?? null,
  }));
}

async function openBrowser(profileId, browserType) {
  const type = resolveBrowserType(browserType);
  const key = getApiKey(type);
  return CONNECTORS[type].open(profileId, key);
}

async function closeBrowser(profileId, browserType) {
  const type = resolveBrowserType(browserType);
  const key = getApiKey(type);
  return CONNECTORS[type].close(profileId, key);
}

async function deleteProfiles(profileIds, browserType) {
  const type = resolveBrowserType(browserType);
  const key = getApiKey(type);
  return CONNECTORS[type].delete(profileIds, key);
}

async function createFolder(payload, browserType) {
  const type = resolveBrowserType(browserType);
  const key = getApiKey(type);
  return CONNECTORS[type].createFolder(payload, key);
}

async function moveProfilesToFolder(profileIds, folderId, browserType) {
  const type = resolveBrowserType(browserType);
  const key = getApiKey(type);
  return CONNECTORS[type].moveToFolder(profileIds, folderId, key);
}

async function bulkCreateProfiles(opts, onEvent) {
  const type = resolveBrowserType(opts.browserType);
  const key = getApiKey(type);
  const emit = (payload) => onEvent?.({ browserType: type, ...payload });

  if (type === 'mostlogin') {
    const folders = await mostlogin.getFolderList();
    const folderList = folders?.list || folders?.data || folders?.folders || [];
    const folderId = opts.folderId || folderList[0]?.id;
    if (!folderId) throw new Error('Нет папки в MostLogin');
    return CONNECTORS.mostlogin.bulkCreate({
      ...opts,
      folderId,
      onProgress: (p) => emit({ type: p.error ? 'error' : 'info', ...p }),
      shouldAbort: opts.shouldAbort,
    });
  }

  return CONNECTORS[type].bulkCreate({
    ...opts,
    apiKey: key,
    onProgress: (p) => emit(p),
    shouldAbort: opts.shouldAbort,
  });
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeProxyEntry(proxy) {
  if (!proxy?.host) return null;
  return {
    host: proxy.host,
    port: parseInt(proxy.port, 10),
    username: proxy.username || proxy.proxyUsername || '',
    password: proxy.password || proxy.proxyPassword || '',
    type: proxy.type || proxy.protocol || 'http',
  };
}

async function assignProxiesToProfiles({ profileIds, proxies, mode = 'sequential', browserType }) {
  const type = resolveBrowserType(browserType);
  const list = (proxies || []).map(normalizeProxyEntry).filter(Boolean);
  if (!list.length) {
    return { ok: false, error: 'Добавьте хотя бы один прокси' };
  }
  if (!profileIds?.length) {
    return { ok: false, error: 'Не выбраны профили' };
  }

  const key = getApiKey(type);
  const ordered = mode === 'random' ? shuffleArray(list) : list;
  const errors = [];
  for (let i = 0; i < profileIds.length; i += 1) {
    const proxy = ordered[i % ordered.length];
    try {
      if (type === 'mostlogin') {
        await mostlogin.updateProfileProxy(profileIds[i], proxy);
      } else if (type === 'vision') {
        await vision.updateProfileProxy(profileIds[i], proxy, key);
      } else if (type === 'zenno') {
        await zenno.updateProfileProxy(profileIds[i], proxy, key);
      }
    } catch (e) {
      errors.push({ id: profileIds[i], error: e.message });
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    updated: profileIds.length - errors.length,
  };
}

async function fetchSpaceProxiesForBrowser({ count, maxPerProxy, browserType }) {
  const proxies = await spaceproxy.fetchProxies(count || 10);
  const profiles = await listProfiles(browserType).catch(() => []);
  const globalUsage = await require('./profileMaintenance').getGlobalProxyUsage().catch(() => new Map());
  const filtered = spaceproxy.filterAvailableProxies(
    proxies,
    profiles,
    maxPerProxy || 4,
    globalUsage,
  );
  return {
    ok: true,
    proxies: filtered,
    discarded: Math.max(0, proxies.length - filtered.length),
    total: proxies.length,
  };
}

module.exports = {
  CONNECTORS,
  resolveBrowserType,
  getApiKey,
  testConnection,
  listProfiles,
  listFolders,
  openBrowser,
  closeBrowser,
  deleteProfiles,
  createFolder,
  moveProfilesToFolder,
  bulkCreateProfiles,
  fetchSpaceProxiesForBrowser,
  assignProxiesToProfiles,
};
