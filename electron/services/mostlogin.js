/**
 * MostLogin Local API client — https://apidocs.mostlogin.com/
 */
const axios = require('axios');
const store = require('./store');

const ENDPOINTS = {
  getProfiles: '/api/profile/getProfiles',
  quickCreateProfile: '/api/profile/quickCreateProfile',
  advancedCreateProfile: '/api/profile/advancedCreateProfile',
  updateProfileBaseProxy: '/api/profile/updateProfileBaseProxy',
  moveToRecycle: '/api/profile/moveProfiletoRecycle',
  openBrowser: '/api/browser/openBrowser',
  closeProfiles: '/api/browser/closeProfiles',
  folderList: '/api/folder/list',
  folderAdd: '/api/folder/add',
  updateProfileFolder: '/api/profile/updateProfileFolder',
  proxyList: '/api/proxy/list',
  createBaseProxy: '/api/proxy/createBaseProxy',
};

const FOLDER_COLORS = {
  blue: '#3370FF',
  teal: '#209E91',
  orange: '#FB9247',
  '#3370FF': '#3370FF',
  '#209E91': '#209E91',
  '#FB9247': '#FB9247',
  '#00B8EB': '#00B8EB',
};

function getClient() {
  const settings = store.getSettings();
  const apiKey = store.getSecret('mostloginKey') || '';
  const baseURL = (settings.mostloginUrl || 'http://127.0.0.1:30898').replace(/\/$/, '');
  return axios.create({
    baseURL,
    timeout: 30000,
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
  });
}

function extractError(error) {
  const data = error.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (data?.message) return String(data.message);
  if (data?.error) return String(data.error);
  if (data?.code && data?.message) return `[${data.code}] ${data.message}`;
  if (error.response?.status === 400) {
    return 'MostLogin отклонил запуск. Проверьте, что профиль существует, MostLogin запущен, и API ключ актуален.';
  }
  if (error.response?.status === 401) {
    return 'Неверный API ключ MostLogin. Обновите ключ в Настройках → Браузер.';
  }
  return error.message;
}

function normalizeProfileId(profileId) {
  if (profileId == null) return null;
  if (typeof profileId === 'object') {
    return profileId.id || profileId.profileId || null;
  }
  const id = String(profileId).trim();
  return id || null;
}

async function testConnection() {
  try {
    const client = getClient();
    const { data } = await client.post(ENDPOINTS.getProfiles, {
      page: 1,
      pageSize: 1,
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: extractError(error) };
  }
}

async function getProfileList(page = 1, pageSize = 100) {
  const client = getClient();
  const { data } = await client.post(ENDPOINTS.getProfiles, { page, pageSize });
  return data;
}

async function quickCreateProfile(payload) {
  const client = getClient();
  const { data } = await client.post(ENDPOINTS.quickCreateProfile, payload);
  return data;
}

async function advancedCreateProfile(payload) {
  const client = getClient();
  const { data } = await client.post(ENDPOINTS.advancedCreateProfile, payload);
  return data;
}

async function updateProfileProxy(profileId, proxy) {
  const client = getClient();
  const { data } = await client.post(ENDPOINTS.updateProfileBaseProxy, {
    host: proxy.host,
    port: proxy.port,
    protocol: proxy.proxyType || proxy.type || 'http',
    proxyMethod: proxy.proxyMethod ?? 0,
    proxyUsername: proxy.username || proxy.proxyUsername || '',
    proxyPassword: proxy.password || proxy.proxyPassword || '',
    ids: Array.isArray(profileId) ? profileId : [profileId],
  });
  return data;
}

const OPEN_BROWSER_TIMEOUT_MS = 120000;

async function openBrowser(profileId, options = {}) {
  const id = normalizeProfileId(profileId);
  if (!id) {
    throw new Error('ID профиля не указан');
  }

  const apiKey = store.getSecret('mostloginKey');
  if (!apiKey) {
    throw new Error('API ключ MostLogin не задан. Откройте Настройки → Браузер и сохраните ключ.');
  }

  const client = getClient();
  const payload = {
    profileId: id,
    ignoreStartUrls: options.ignoreStartUrls ?? false,
    ...(options.urls?.length ? { urls: options.urls } : {}),
  };

  const postOpen = () => client.post(ENDPOINTS.openBrowser, payload, {
    timeout: OPEN_BROWSER_TIMEOUT_MS,
  });

  try {
    const { data } = await postOpen();
    return data;
  } catch (error) {
    const isTimeout = error.code === 'ECONNABORTED' || /timeout/i.test(String(error.message));
    const is400 = error.response?.status === 400;
    if (is400 || isTimeout) {
      try {
        await closeBrowser(id);
        await new Promise((r) => setTimeout(r, 2000));
        const { data } = await postOpen();
        return data;
      } catch (retryError) {
        throw retryError;
      }
    }
    throw error;
  }
}

async function closeBrowser(profileId) {
  const client = getClient();
  const profileIds = Array.isArray(profileId) ? profileId : [profileId];
  const { data } = await client.post(ENDPOINTS.closeProfiles, { profileIds });
  return data;
}

async function deleteProfiles(profileIds) {
  const client = getClient();
  const ids = Array.isArray(profileIds) ? profileIds : [profileIds];
  const { data } = await client.post(ENDPOINTS.moveToRecycle, { ids });
  return data;
}

async function getFolderList(page = 1, pageSize = 100) {
  const client = getClient();
  const { data } = await client.post(ENDPOINTS.folderList, { page, pageSize });
  return data;
}

async function createFolder({ folderName, folderColor = '#3370FF', sortOrder = 0 }) {
  const client = getClient();
  const { data } = await client.post(ENDPOINTS.folderAdd, { folderName, folderColor, sortOrder });
  return data;
}

async function moveProfilesToFolder(profileIds, folderId) {
  const client = getClient();
  const ids = Array.isArray(profileIds) ? profileIds : [profileIds];
  const { data } = await client.post(ENDPOINTS.updateProfileFolder, { ids, folderId });
  return data;
}

async function getProxyList(page = 1, pageSize = 100) {
  const client = getClient();
  const { data } = await client.post(ENDPOINTS.proxyList, { page, pageSize });
  return data;
}

async function addBasicProxy(proxy) {
  const client = getClient();
  const { data } = await client.post(ENDPOINTS.createBaseProxy, {
    host: proxy.host,
    port: proxy.port,
    protocol: proxy.type || 'http',
    proxyMethod: 0,
    proxyUsername: proxy.username || '',
    proxyPassword: proxy.password || '',
    publicViewing: 0,
    repeatItem: true,
    rotateUrl: '',
  });
  return data;
}

function distributeProxies(proxies, count, profilesPerProxy) {
  const usage = new Map();
  const result = [];
  let lastProxy = null;

  for (let i = 0; i < count; i++) {
    const available = proxies.filter((p) => {
      const key = p.host || p;
      const used = usage.get(key) || 0;
      return used < profilesPerProxy && key !== lastProxy;
    });
    if (available.length === 0) break;
    const pick = available[i % available.length];
    const key = pick.host || pick;
    usage.set(key, (usage.get(key) || 0) + 1);
    result.push(pick);
    lastProxy = key;
  }
  return result;
}

async function bulkCreateProfiles({ count, startNumber, folderId, proxies, profilesPerProxy, onProgress }) {
  const assigned = distributeProxies(proxies, count, profilesPerProxy);
  const created = [];
  const errors = [];

  for (let i = 0; i < count; i++) {
    const num = startNumber + i;
    const proxy = assigned[i];
    try {
      let profile;
      if (proxy) {
        profile = await advancedCreateProfile({
          title: String(num),
          folderId,
          proxy: {
            proxyMethod: 0,
            host: proxy.host,
            port: proxy.port,
            proxyUsername: proxy.username || '',
            proxyPassword: proxy.password || '',
            protocol: proxy.type || 'http',
          },
          fingerprint: {},
        });
      } else {
        profile = await quickCreateProfile({
          os: 'Win32',
          product: 'chrome',
          folderId,
          coreVersion: '138',
          title: String(num),
        });
      }
      created.push(profile);
      onProgress?.({ current: i + 1, total: count, message: `Профиль #${num} создан` });
    } catch (error) {
      errors.push({ num, error: extractError(error) });
      onProgress?.({ current: i + 1, total: count, message: `Ошибка #${num}: ${extractError(error)}`, error: true });
    }
  }
  return { created, errors };
}

module.exports = {
  ENDPOINTS,
  FOLDER_COLORS,
  testConnection,
  getProfileList,
  quickCreateProfile,
  advancedCreateProfile,
  updateProfileProxy,
  openBrowser,
  closeBrowser,
  deleteProfiles,
  getFolderList,
  createFolder,
  moveProfilesToFolder,
  getProxyList,
  addBasicProxy,
  distributeProxies,
  bulkCreateProfiles,
  extractError,
};
