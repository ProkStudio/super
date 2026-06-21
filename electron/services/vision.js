/**
 * Vision Browser API — cloud CRUD + local start/stop (127.0.0.1:3030)
 * Docs: https://docs.browser.vision/
 */
const axios = require('axios');
const store = require('./store');

const CLOUD_BASE = 'https://v1.empr.cloud/api/v1';
const LOCAL_BASE = 'http://127.0.0.1:3030';
const WORKSPACE = -1;

function getToken(apiKey) {
  return (apiKey || store.getSecret('visionKey') || '').trim();
}

function cloudClient(apiKey) {
  const token = getToken(apiKey);
  return axios.create({
    baseURL: CLOUD_BASE,
    timeout: 45000,
    headers: { 'X-Token': token, 'Content-Type': 'application/json' },
  });
}

function localClient(apiKey) {
  const settings = store.getSettings();
  const baseURL = (settings.visionLocalUrl || LOCAL_BASE).replace(/\/$/, '');
  return axios.create({
    baseURL,
    timeout: 120000,
    headers: { 'X-Token': getToken(apiKey) },
  });
}

function extractError(error) {
  const data = error.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (data?.message) return String(data.message);
  if (data?.error) return String(data.error);
  if (error.response?.status === 401) return 'Неверный X-Token Vision. Проверьте ключ в Настройках.';
  return error.message;
}

async function testConnection(apiKey) {
  try {
    const client = cloudClient(apiKey);
    const { data } = await client.get('/profile_folders', { params: { workspaceId: WORKSPACE } });
    const folders = data?.data || data?.items || data || [];
    return { ok: true, folders: Array.isArray(folders) ? folders.length : 0 };
  } catch (error) {
    return { ok: false, error: extractError(error) };
  }
}

async function getFolderList(apiKey) {
  const client = cloudClient(apiKey);
  const { data } = await client.get('/profile_folders', { params: { workspaceId: WORKSPACE } });
  const list = data?.data || data?.items || [];
  return list.map((f) => ({
    id: f.id,
    folderName: f.folder_name || f.name || f.folderName || 'Folder',
    folderColor: f.folder_color || f.color,
  }));
}

async function getProfileList(apiKey, folderId) {
  const client = cloudClient(apiKey);
  const params = { workspaceId: WORKSPACE };
  if (folderId) params.folderId = folderId;
  const { data } = await client.get('/profiles', { params });
  const list = data?.data || data?.items || data?.profiles || [];
  return list.map(normalizeProfile);
}

function normalizeProfile(p) {
  const id = p.id || p.profile_id || p.profileId;
  return {
    id,
    profileId: id,
    title: p.profile_name || p.name || p.title || id?.slice?.(0, 8) || '',
    name: p.profile_name || p.name || p.title,
    folder_id: p.folder_id || p.folderId,
    folderId: p.folder_id || p.folderId,
    folder_name: p.folder_name || '',
    status: p.status || 'Idle',
    started: p.running ? 1 : 0,
    proxy: p.proxy || p.proxy_str || '',
  };
}

async function openBrowser(profileId, apiKey) {
  const id = String(profileId || '').trim();
  if (!id) throw new Error('ID профиля Vision не указан');
  const client = localClient(apiKey);
  const { data } = await client.get(`/start/${id}`);
  const ws = data?.ws_endpoint || data?.wsEndpoint || data?.ws || data?.http;
  const port = data?.port;
  const cdpUrl = ws || (port ? `http://127.0.0.1:${port}` : null);
  if (!cdpUrl) throw new Error('Vision не вернул CDP/WebSocket endpoint');
  return { http: cdpUrl, ws: ws || cdpUrl, cdpUrl, raw: data };
}

async function closeBrowser(profileId, apiKey) {
  const client = localClient(apiKey);
  await client.get(`/stop/${String(profileId)}`);
  return { ok: true };
}

async function createProfile({ name, folderId, proxy, apiKey }) {
  const client = cloudClient(apiKey);
  const body = {
    profile_name: String(name),
    folder_id: folderId,
    workspaceId: WORKSPACE,
  };
  if (proxy?.host) {
    body.proxy = {
      host: proxy.host,
      port: proxy.port,
      username: proxy.username || '',
      password: proxy.password || '',
      type: proxy.type || 'http',
    };
  }
  const { data } = await client.post('/profiles/create', body);
  return data?.data || data;
}

async function updateProfileProxy(profileId, proxy, apiKey) {
  const client = cloudClient(apiKey);
  const body = {
    workspaceId: WORKSPACE,
    proxy: {
      host: proxy.host,
      port: parseInt(proxy.port, 10),
      username: proxy.username || '',
      password: proxy.password || '',
      type: proxy.type || 'http',
    },
  };
  try {
    const { data } = await client.patch(`/profiles/${String(profileId)}`, body);
    return data?.data || data;
  } catch (error) {
    const { data } = await client.put(`/profiles/${String(profileId)}`, body);
    return data?.data || data;
  }
}

async function deleteProfiles(profileIds, apiKey) {
  const client = cloudClient(apiKey);
  const ids = Array.isArray(profileIds) ? profileIds : [profileIds];
  await Promise.all(ids.map((id) => client.delete(`/profiles/${id}`, {
    params: { workspaceId: WORKSPACE },
  })));
  return { ok: true };
}

function distributeProxies(proxies, count, profilesPerProxy) {
  const usage = new Map();
  const result = [];
  let lastProxy = null;
  for (let i = 0; i < count; i += 1) {
    const available = proxies.filter((p) => {
      const key = p.host || p;
      return (usage.get(key) || 0) < profilesPerProxy && key !== lastProxy;
    });
    if (!available.length) break;
    const pick = available[i % available.length];
    const key = pick.host || pick;
    usage.set(key, (usage.get(key) || 0) + 1);
    result.push(pick);
    lastProxy = key;
  }
  return result;
}

async function bulkCreateProfiles({
  count, startNumber, folderId, proxies, profilesPerProxy, apiKey, onProgress, shouldAbort,
}) {
  const assigned = distributeProxies(proxies || [], count, profilesPerProxy || 1);
  const created = [];
  const errors = [];
  let folders = [];
  try {
    folders = await getFolderList(apiKey);
  } catch { /* ignore */ }
  const targetFolder = folderId || folders[0]?.id;
  if (!targetFolder) throw new Error('Нет папки Vision — создайте папку в Vision Browser');

  for (let i = 0; i < count; i += 1) {
    if (shouldAbort?.()) break;
    const num = startNumber + i;
    const proxy = assigned[i];
    try {
      const profile = await createProfile({
        name: String(num),
        folderId: targetFolder,
        proxy,
        apiKey,
      });
      created.push(profile);
      onProgress?.({
        type: 'success',
        current: i + 1,
        total: count,
        created: created.length,
        message: `Vision #${num} создан`,
      });
    } catch (error) {
      errors.push({ num, error: extractError(error) });
      onProgress?.({
        type: 'error',
        current: i + 1,
        total: count,
        created: created.length,
        message: `Ошибка #${num}: ${extractError(error)}`,
        error: true,
      });
    }
  }
  onProgress?.({ type: 'done', created: created.length, total: count, message: 'Готово' });
  return { created, errors };
}

module.exports = {
  testConnection,
  getFolderList,
  getProfileList,
  openBrowser,
  closeBrowser,
  createProfile,
  updateProfileProxy,
  deleteProfiles,
  bulkCreateProfiles,
  extractError,
};
