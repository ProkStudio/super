const store = require('./store');
const spaceproxy = require('./spaceproxy');
const browserProfiles = require('./browserProfiles');

const BROWSER_TYPES = ['mostlogin', 'vision', 'zenno'];

function extractIp(proxy) {
  if (!proxy) return null;
  if (typeof proxy === 'string') {
    const cleaned = proxy.replace(/^socks5:\/\//i, '').replace(/^https?:\/\//i, '');
    const atPart = cleaned.includes('@') ? cleaned.split('@').pop() : cleaned;
    const host = atPart.split(':')[0]?.trim();
    return host || null;
  }
  return proxy.host || proxy.ip || null;
}

function normalizeDeadIps(list) {
  return (list || []).map((entry) => {
    if (typeof entry === 'string') return entry.trim();
    return entry?.ip || entry?.host || '';
  }).filter(Boolean);
}

async function collectProfilesByIp() {
  const byIp = new Map();
  const items = [];

  for (const browserType of BROWSER_TYPES) {
    let profiles = [];
    try {
      profiles = await browserProfiles.listProfiles(browserType);
    } catch {
      continue;
    }
    for (const profile of profiles) {
      const ip = extractIp(profile.proxy);
      if (!ip) continue;
      const entry = { profileId: profile.id, browserType, ip, title: profile.title || profile.name };
      items.push(entry);
      if (!byIp.has(ip)) byIp.set(ip, []);
      byIp.get(ip).push(entry);
    }
  }
  return { byIp, items };
}

async function getDeadProxyProfiles() {
  const deadIps = new Set(normalizeDeadIps(store.getDeadProxies()));
  const { byIp } = await collectProfilesByIp();
  const matches = [];
  for (const ip of deadIps) {
    const list = byIp.get(ip) || [];
    list.forEach((m) => matches.push(m));
  }
  return matches;
}

async function getGlobalProxyUsage() {
  const usage = new Map();
  const { items } = await collectProfilesByIp();
  for (const item of items) {
    usage.set(item.ip, (usage.get(item.ip) || 0) + 1);
  }
  return usage;
}

function pickProxyForProfile(proxies, usage, maxPerProxy = 4) {
  for (const proxy of proxies) {
    const ip = proxy.host;
    if ((usage.get(ip) || 0) < maxPerProxy) {
      usage.set(ip, (usage.get(ip) || 0) + 1);
      return proxy;
    }
  }
  return proxies[0] || null;
}

async function replaceDeadProxies({ maxPerProxy = 4, send } = {}) {
  const deadIps = normalizeDeadIps(store.getDeadProxies());
  if (!deadIps.length) {
    return { ok: false, error: 'Список мёртвых прокси пуст' };
  }

  const deadSet = new Set(deadIps);
  const { byIp } = await collectProfilesByIp();
  const targets = [];
  for (const ip of deadSet) {
    (byIp.get(ip) || []).forEach((t) => targets.push(t));
  }
  if (!targets.length) {
    return { ok: true, updated: 0, message: 'Нет профилей с мёртвыми прокси' };
  }

  send?.('profiles:replaceProgress', { type: 'info', message: `Найдено профилей: ${targets.length}` });

  let proxies = [];
  try {
    proxies = await spaceproxy.fetchProxies(Math.max(targets.length, 5));
    const usage = await getGlobalProxyUsage();
    proxies = spaceproxy.filterAvailableProxies(proxies, [], maxPerProxy, usage);
  } catch (e) {
    return { ok: false, error: e.message };
  }

  if (!proxies.length) {
    return { ok: false, error: 'SpaceProxy не вернул доступные прокси' };
  }

  const usage = await getGlobalProxyUsage();
  let updated = 0;
  const errors = [];

  for (const target of targets) {
    const proxy = pickProxyForProfile(proxies, usage, maxPerProxy);
    if (!proxy) {
      errors.push({ profileId: target.profileId, error: 'Нет свободного прокси' });
      continue;
    }
    try {
      const result = await browserProfiles.assignProxiesToProfiles({
        profileIds: [target.profileId],
        proxies: [proxy],
        mode: 'sequential',
        browserType: target.browserType,
      });
      if (!result.ok) {
        throw new Error(result.errors?.[0]?.error || result.error || 'Не удалось назначить прокси');
      }
      updated += 1;
      send?.('profiles:replaceProgress', {
        type: 'success',
        message: `[${target.browserType}] ${target.title || target.profileId}: прокси заменён`,
      });
    } catch (e) {
      errors.push({ profileId: target.profileId, error: e.message });
      send?.('profiles:replaceProgress', { type: 'error', message: e.message });
    }
  }

  return { ok: errors.length === 0, updated, errors, total: targets.length };
}

async function deleteBanProfilesWithDeadProxies({ send } = {}) {
  const deadSet = new Set(normalizeDeadIps(store.getDeadProxies()));
  if (!deadSet.size) {
    return { ok: false, error: 'Список мёртвых прокси пуст' };
  }

  const meta = store.getProfiles().meta || {};
  const { items } = await collectProfilesByIp();
  const toDelete = items.filter((item) => {
    const localStatus = meta[item.profileId]?.status;
    return localStatus === 'ban' && deadSet.has(item.ip);
  });

  if (!toDelete.length) {
    return { ok: true, deleted: 0, message: 'Нет бан-профилей с мёртвыми прокси' };
  }

  const byBrowser = {};
  for (const item of toDelete) {
    if (!byBrowser[item.browserType]) byBrowser[item.browserType] = [];
    byBrowser[item.browserType].push(item.profileId);
  }

  let deleted = 0;
  const profilesStore = store.getProfiles();
  const nextMeta = { ...profilesStore.meta };

  for (const [browserType, ids] of Object.entries(byBrowser)) {
    try {
      await browserProfiles.deleteProfiles(ids, browserType);
      ids.forEach((id) => { delete nextMeta[id]; });
      deleted += ids.length;
      send?.('profiles:replaceProgress', {
        type: 'info',
        message: `Удалено ${ids.length} профилей (${browserType})`,
      });
    } catch (e) {
      send?.('profiles:replaceProgress', { type: 'error', message: e.message });
    }
  }

  store.setProfiles({ ...profilesStore, meta: nextMeta });
  return { ok: true, deleted };
}

async function replaceBans({ maxPerProxy = 4, send } = {}) {
  const deleteResult = await deleteBanProfilesWithDeadProxies({ send });
  const replaceResult = await replaceDeadProxies({ maxPerProxy, send });
  return {
    ok: deleteResult.ok !== false && replaceResult.ok !== false,
    deleted: deleteResult.deleted || 0,
    updated: replaceResult.updated || 0,
    errors: replaceResult.errors || [],
  };
}

module.exports = {
  extractIp,
  getDeadProxyProfiles,
  getGlobalProxyUsage,
  replaceDeadProxies,
  deleteBanProfilesWithDeadProxies,
  replaceBans,
};
