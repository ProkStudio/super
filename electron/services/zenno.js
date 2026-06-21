/**
 * ZennoBrowser local API — http://127.0.0.1:8160 (Api-Token header)
 */
const axios = require('axios');
const store = require('./store');

const DEFAULT_PORTS = [8160, 8080, 59200, 58888];
const WORKSPACE = -1;

function getToken(apiKey) {
  return (apiKey || store.getSecret('zennoKey') || '').trim();
}

function getHeaders(apiKey) {
  return { 'Api-Token': getToken(apiKey), 'Content-Type': 'application/json' };
}

async function discoverClient(apiKey) {
  const settings = store.getSettings();
  const configured = (settings.zennoUrl || '').replace(/\/$/, '');
  const ports = configured
    ? [configured]
    : DEFAULT_PORTS.map((p) => `http://127.0.0.1:${p}`);

  let lastError = null;
  for (const baseURL of ports) {
    try {
      const client = axios.create({
        baseURL,
        timeout: 15000,
        headers: getHeaders(apiKey),
      });
      await client.get('/v1/workspaces');
      return client;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('ZennoBrowser API недоступен. Запустите ZennoBrowser.');
}

function extractError(error) {
  const data = error.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (data?.message) return String(data.message);
  return error.message;
}

async function testConnection(apiKey) {
  try {
    await discoverClient(apiKey);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: extractError(error) };
  }
}

async function getFolderList(apiKey) {
  const client = await discoverClient(apiKey);
  const { data } = await client.get('/v1/profile_folders', { params: { workspaceId: WORKSPACE } });
  const list = data?.items || data?.data || data?.folders || [];
  return list.map((f) => ({
    id: f.id,
    folderName: f.name || f.folder_name || `Folder ${f.id}`,
  }));
}

async function getProfileList(apiKey, folderId) {
  const client = await discoverClient(apiKey);
  const params = { workspaceId: WORKSPACE };
  if (folderId) params.folderId = folderId;
  const { data } = await client.get('/v1/profiles', { params });
  const list = data?.items || data?.data || data?.profiles || [];
  return list.map(normalizeProfile);
}

function normalizeProfile(p) {
  const id = p.id || p.profileId || p.profile_id;
  return {
    id,
    profileId: id,
    title: p.name || p.profile_name || id?.slice?.(0, 8) || '',
    name: p.name || p.profile_name,
    folder_id: p.folder_id || p.folderId,
    folderId: p.folder_id || p.folderId,
    status: p.status || 'Idle',
    started: p.running ? 1 : 0,
    proxy: p.proxy_str || p.proxy || '',
  };
}

async function openBrowser(profileId, apiKey) {
  const id = String(profileId || '').trim();
  if (!id) throw new Error('ID профиля Zenno не указан');
  const client = await discoverClient(apiKey);
  const { data } = await client.post('/v1/browser_instances/create', null, {
    params: { profileId: id, workspaceId: WORKSPACE },
  });
  const ws = data?.ws_endpoint || data?.connectionString || data?.ws;
  if (!ws) throw new Error(data?.message || 'ZennoBrowser не вернул WebSocket endpoint');
  return { http: ws, ws, cdpUrl: ws, raw: data };
}

async function closeBrowser(profileId, apiKey) {
  const client = await discoverClient(apiKey);
  await client.delete(`/v1/browser_instances/${String(profileId)}`, {
    params: { workspaceId: WORKSPACE },
  });
  return { ok: true };
}

async function uploadProxy(proxy, apiKey) {
  const client = await discoverClient(apiKey);
  const proxyUri = proxy.username
    ? `${proxy.type || 'http'}://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`
    : `${proxy.host}:${proxy.port}`;
  const { data } = await client.post('/v1/proxies', { proxyUri });
  return data?.id || data?.proxy_id || data?.proxyServerId;
}

async function createProfile({ name, folderId, proxy, apiKey }) {
  const client = await discoverClient(apiKey);
  const body = { name: String(name), folder_id: folderId, workspaceId: WORKSPACE };
  if (proxy?.host) {
    try {
      body.proxyServerId = await uploadProxy(proxy, apiKey);
    } catch {
      body.proxy_str = `${proxy.host}:${proxy.port}:${proxy.username || ''}:${proxy.password || ''}`;
    }
  }
  const { data } = await client.post('/v1/profiles/create', body);
  return data?.data || data;
}

async function updateProfileProxy(profileId, proxy, apiKey) {
  const client = await discoverClient(apiKey);
  const body = { workspaceId: WORKSPACE };
  try {
    body.proxyServerId = await uploadProxy(proxy, apiKey);
  } catch {
    body.proxy_str = `${proxy.host}:${proxy.port}:${proxy.username || ''}:${proxy.password || ''}`;
  }
  try {
    const { data } = await client.patch(`/v1/profiles/${String(profileId)}`, body);
    return data?.data || data;
  } catch (error) {
    const { data } = await client.put(`/v1/profiles/${String(profileId)}`, body);
    return data?.data || data;
  }
}

async function deleteProfiles(profileIds, apiKey) {
  const client = await discoverClient(apiKey);
  const ids = Array.isArray(profileIds) ? profileIds : [profileIds];
  await Promise.all(ids.map((id) => client.delete(`/v1/profiles/${id}`, {
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
  if (!targetFolder) throw new Error('Нет папки ZennoBrowser');

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
        message: `Zenno #${num} создан`,
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
