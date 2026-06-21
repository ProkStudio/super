const axios = require('axios');
const store = require('./store');

const BASE = 'https://panel.spaceproxy.net/api';

async function fetchProxies(count = 10) {
  const apiKey = store.getSecret('spaceproxyKey');
  if (!apiKey) throw new Error('SpaceProxy API key not configured');

  try {
    const { data } = await axios.get(`${BASE}/proxies`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      params: { count, format: 'json' },
      timeout: 30000,
    });
    const list = Array.isArray(data) ? data : data.proxies || data.data || [];
    return list.map(parseProxyEntry).filter(Boolean);
  } catch {
    return parseProxyLines(apiKey);
  }
}

function parseProxyEntry(entry) {
  if (typeof entry === 'string') return parseProxyLine(entry);
  if (entry.host) {
    return {
      host: entry.host,
      port: entry.port,
      username: entry.username || entry.user || '',
      password: entry.password || entry.pass || '',
      type: entry.type || 'http',
    };
  }
  return null;
}

function parseProxyLine(line) {
  const parts = (line || '').trim().split(':');
  if (parts.length < 2) return null;
  return {
    host: parts[0],
    port: parseInt(parts[1], 10),
    username: parts[2] || '',
    password: parts[3] || '',
    type: 'http',
  };
}

function parseProxyLines(text) {
  return (text || '').split(/\r?\n/).map(parseProxyLine).filter(Boolean);
}

function proxyHostKey(profile) {
  if (!profile) return null;
  if (profile.proxyHost) return profile.proxyHost;
  const proxy = profile.proxy;
  if (!proxy) return null;
  if (typeof proxy === 'string') {
    const cleaned = proxy.replace(/^socks5:\/\//i, '').replace(/^https?:\/\//i, '');
    const part = cleaned.includes('@') ? cleaned.split('@').pop() : cleaned;
    return part.split(':')[0]?.trim() || null;
  }
  return proxy.host || null;
}

function filterAvailableProxies(proxies, existingProfiles, profilesPerProxy, externalUsage) {
  const usage = externalUsage ? new Map(externalUsage) : new Map();
  for (const p of existingProfiles || []) {
    const key = proxyHostKey(p);
    if (key) usage.set(key, (usage.get(key) || 0) + 1);
  }
  return proxies.filter((proxy) => {
    const key = proxy.host;
    return (usage.get(key) || 0) < profilesPerProxy;
  });
}

module.exports = { fetchProxies, parseProxyLines, filterAvailableProxies, proxyHostKey };
