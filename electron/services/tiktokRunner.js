/**
 * TikTok automation runner — detect login, warmup (паттерн accountChecker / taskRunner).
 */
const store = require('./store');
const browserProfiles = require('./browserProfiles');
const pythonRunner = require('./pythonRunner');

const TIKTOK_VIDEO_RE = /tiktok\.com\/@([^/?#]+)\/video\/(\d+)/i;
const TIKTOK_SHORT_RE = /(vm|vt)\.tiktok\.com|tiktok\.com\/t\/|m\.tiktok\.com\/v\//i;
const RESOLVE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36';

function canonicalTiktokVideoUrl(url) {
  const m = String(url || '').match(TIKTOK_VIDEO_RE);
  if (!m) return String(url || '').trim();
  return `https://www.tiktok.com/@${m[1]}/video/${m[2]}`;
}

async function resolveTiktokVideoUrl(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return null;
  const withScheme = trimmed.startsWith('http') ? trimmed : `https://${trimmed.replace(/^\/+/, '')}`;
  if (TIKTOK_VIDEO_RE.test(withScheme) && !TIKTOK_SHORT_RE.test(withScheme)) {
    return canonicalTiktokVideoUrl(withScheme);
  }
  if (!TIKTOK_SHORT_RE.test(withScheme)) return trimmed;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(withScheme, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': RESOLVE_UA },
    });
    return canonicalTiktokVideoUrl(res.url || withScheme);
  } catch {
    try {
      const res = await fetch(withScheme, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': RESOLVE_UA },
      });
      return canonicalTiktokVideoUrl(res.url || withScheme);
    } catch {
      return trimmed;
    }
  } finally {
    clearTimeout(timer);
  }
}

async function normalizeVideoUrlList(urls, send) {
  const out = [];
  for (const line of urls) {
    const resolved = await resolveTiktokVideoUrl(line);
    if (!resolved) continue;
    if (resolved !== line.trim()) {
      pushLog(send, `Короткая ссылка → ${resolved}`);
    }
    out.push(resolved);
  }
  return out;
}

let automationRunning = false;
let abortAutomation = false;

function clampThreads(value, max = 10) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 2;
  return Math.max(1, Math.min(max, Math.round(n)));
}

function setAutomationState(patch) {
  const data = store.getTiktok();
  store.setTiktok({
    ...data,
    automation: { ...data.automation, ...patch },
  });
}

function pushLog(send, text, level = 'info') {
  const entry = { text, level, time: new Date().toLocaleTimeString() };
  const data = store.getTiktok();
  const logs = [...(data.automation?.logs || []), entry].slice(-400);
  setAutomationState({ logs });
  send?.('tiktok:automation:log', entry);
  send?.('tiktok:detectLog', entry);
}

function updateTiktokMeta(profileId, patch) {
  const profiles = store.getProfiles();
  const meta = { ...profiles.meta };
  meta[profileId] = { ...meta[profileId], ...patch };
  store.setProfiles({ ...profiles, meta });
}

async function openProfileSession(profileId, browserType, send) {
  const meta = store.getProfiles().meta?.[profileId] || {};
  const label = meta.tiktokUsername || profileId.slice(0, 8);
  pushLog(send, `Открываю профиль ${label}…`);
  const data = await browserProfiles.openBrowser(profileId, browserType);
  const cdpUrl = data.http || data.cdpUrl || data.ws;
  if (!cdpUrl) throw new Error('Браузер не вернул CDP URL');
  return { profileId, cdpUrl, login: label };
}

async function runScriptBatch({
  profileIds,
  threads,
  scriptName,
  config,
  send,
  modeLabel,
  onSessionResult,
}) {
  if (automationRunning) return { ok: false, error: 'Автоматизация уже выполняется' };
  const ids = (profileIds || []).filter(Boolean);
  if (!ids.length) return { ok: false, error: 'Не выбраны профили' };

  automationRunning = true;
  abortAutomation = false;
  const browserType = store.getSettings().browserProvider || 'mostlogin';
  const concurrency = clampThreads(threads, 20);
  const batches = [];
  for (let i = 0; i < ids.length; i += concurrency) {
    batches.push(ids.slice(i, i + concurrency));
  }

  setAutomationState({ running: true, mode: modeLabel, logs: [] });
  const allResults = [];

  try {
    for (let bi = 0; bi < batches.length; bi += 1) {
      if (abortAutomation) break;
      const batch = batches[bi];
      const sessions = [];
      const openedProfiles = [];

      await Promise.all(batch.map(async (profileId) => {
        if (abortAutomation) return;
        try {
          const session = await openProfileSession(profileId, browserType, send);
          sessions.push(session);
          openedProfiles.push(profileId);
        } catch (e) {
          const msg = browserProfiles.connector(browserType).extractError?.(e) || e.message;
          allResults.push({ profileId, error: msg, tiktokStatus: 'error' });
          pushLog(send, `${profileId.slice(0, 8)}: ${msg}`, 'error');
        }
      }));

      if (!sessions.length || abortAutomation) continue;

      pushLog(send, `Пакет ${bi + 1}/${batches.length}: ${sessions.length} проф.`);
      let scriptResults = [];
      try {
        const runResult = await pythonRunner.runScript(
          scriptName,
          { profileIds: batch, sessions, threads: sessions.length, ...config },
          (p) => {
            if (p?.message) pushLog(send, p.message);
            if (p?.percent != null) send?.('tiktok:automation:progress', p);
          },
          (msg) => pushLog(send, typeof msg === 'string' ? msg : msg?.text || String(msg)),
        );
        scriptResults = runResult?.sessions || [];
        for (const stat of scriptResults) {
          if (stat?.profileId && onSessionResult) onSessionResult(stat);
        }
        allResults.push(...scriptResults);
      } finally {
        await Promise.all(openedProfiles.map(async (profileId) => {
          const stat = scriptResults.find((s) => s.profileId === profileId);
          const keepOpen = Boolean(stat?.keepBrowserOpen);
          if (keepOpen) {
            const lbl = stat?.login || profileId.slice(0, 8);
            pushLog(send, `${lbl}: браузер оставлен открытым после комментинга`, 'warn');
            return;
          }
          try {
            await browserProfiles.closeBrowser(profileId, browserType);
          } catch { /* ignore */ }
        }));
      }
    }

    const failed = allResults.filter((s) => s?.error);
    if (failed.length) {
      const summary = failed.map((s) => s.error).slice(0, 3).join('; ');
      pushLog(send, `Завершено с ошибками: ${failed.length}/${allResults.length} — ${summary}`, 'error');
      return { ok: false, error: summary || 'Ошибки в сессиях', results: allResults, sessions: allResults };
    }

    pushLog(send, `Готово: обработано ${allResults.length} профилей`, 'success');
    return { ok: true, results: allResults, sessions: allResults };
  } catch (e) {
    pushLog(send, e.message || String(e), 'error');
    return { ok: false, error: e.message, results: allResults };
  } finally {
    automationRunning = false;
    setAutomationState({ running: false, mode: null });
  }
}

async function detectLogin(opts, send) {
  return runScriptBatch({
    profileIds: opts?.profileIds,
    threads: opts?.threads,
    scriptName: 'tiktok/detect_login.py',
    config: { pagePreferDomains: ['tiktok.com'] },
    send,
    modeLabel: 'detect_login',
    onSessionResult: (stat) => {
      updateTiktokMeta(stat.profileId, {
        ...(stat.tiktokUsername != null ? { tiktokUsername: stat.tiktokUsername } : {}),
        ...(stat.tiktokStatus ? { tiktokStatus: stat.tiktokStatus } : {}),
        ...(stat.tiktokReady != null ? { tiktokReady: !!stat.tiktokReady } : {}),
      });
    },
  });
}

async function runWarmup(opts, send) {
  const config = {
    ...(opts?.config || {}),
    pagePreferDomains: ['tiktok.com'],
  };
  return runScriptBatch({
    profileIds: opts?.profileIds,
    threads: opts?.threads ?? config?.threads,
    scriptName: 'tiktok/warmup.py',
    config,
    send,
    modeLabel: 'warmup',
    onSessionResult: (stat) => {
      if (stat?.watched != null) {
        pushLog(
          send,
          `${stat.login || stat.profileId}: просмотрено ${stat.watched}, ♥${stat.likes || 0}, +${stat.follows || 0}`,
          stat.error ? 'error' : 'success',
        );
      }
    },
  });
}

function mergeCommentStatsFromSession(stat) {
  const data = store.getTiktok();
  const existing = data.commentStats || [];
  const map = new Map(existing.map((row) => [row.videoUrl || row.videoId, { ...row }]));
  for (const vs of stat?.videoStats || []) {
    const key = vs.videoUrl || vs.videoId;
    if (!key) continue;
    const prev = map.get(key) || { videoUrl: vs.videoUrl, videoId: vs.videoId, commentsPosted: 0 };
    map.set(key, {
      videoUrl: vs.videoUrl || prev.videoUrl,
      videoId: vs.videoId || prev.videoId,
      commentsPosted: (prev.commentsPosted || 0) + (vs.commentsPosted || 0),
      lastRunAt: new Date().toISOString(),
    });
  }
  store.setTiktok({ ...data, commentStats: [...map.values()] });
}

function mergeRepliedKeys(newKeys) {
  if (!newKeys?.length) return;
  const data = store.getTiktok();
  const set = new Set(data.repliedKeys || []);
  for (const k of newKeys) set.add(k);
  store.setTiktok({ ...data, repliedKeys: [...set].slice(-50000) });
}

async function runSmartComment(opts, send) {
  const settings = store.getSettings();
  const baseConfig = opts?.config || {};
  const rawVideoUrls = Array.isArray(baseConfig.videoUrls)
    ? baseConfig.videoUrls
    : String(baseConfig.videoUrlsText || baseConfig.videoUrls || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  const videoUrls = await normalizeVideoUrlList(rawVideoUrls, send);
  const commentPool = Array.isArray(baseConfig.commentPool)
    ? baseConfig.commentPool
    : String(baseConfig.commentPoolText || baseConfig.commentPool || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

  if (!videoUrls.length) {
    return { ok: false, error: 'Укажите хотя бы один URL видео' };
  }
  if (!commentPool.length && !baseConfig.useAi) {
    return { ok: false, error: 'Заполните пул комментариев или включите AI' };
  }

  const tiktokData = store.getTiktok();
  const config = {
    ...baseConfig,
    videoUrls,
    commentPool,
    pagePreferDomains: ['tiktok.com'],
    aiApiKey: store.getSecret('deepseekKey') || '',
    aiBaseUrl: settings.aiBaseUrl || 'https://openrouter.ai/api/v1',
    aiModel: settings.aiModel || 'openai/gpt-4o-mini',
    repliedKeys: tiktokData.repliedKeys || [],
    keepBrowserOpen: baseConfig.keepBrowserOpen,
  };

  return runScriptBatch({
    profileIds: opts?.profileIds,
    threads: opts?.threads ?? config?.threads,
    scriptName: 'tiktok/smart_comment.py',
    config,
    send,
    modeLabel: 'smart_comment',
    onSessionResult: (stat) => {
      if (stat?.repliedKeys?.length) mergeRepliedKeys(stat.repliedKeys);
      if (stat?.videoStats?.length) mergeCommentStatsFromSession(stat);
      if (stat?.totalPosted != null || stat?.error) {
        pushLog(
          send,
          stat.error
            ? `${stat.login || stat.profileId}: ${stat.error}`
            : `${stat.login || stat.profileId}: опубликовано ${stat.totalPosted || 0} комм.`,
          stat.error ? 'error' : 'success',
        );
      }
    },
  });
}

function cancelAutomation() {
  abortAutomation = true;
  pythonRunner.cancelJob();
  return { ok: true };
}

function isAutomationRunning() {
  return automationRunning;
}

module.exports = {
  detectLogin,
  runWarmup,
  runSmartComment,
  cancelAutomation,
  isAutomationRunning,
  updateTiktokMeta,
};
