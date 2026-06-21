const { exec } = require('child_process');

const fs = require('fs');

const store = require('./store');

const browserProfiles = require('./browserProfiles');
const automationCoordinator = require('./automationCoordinator');
const pythonRunner = require('./pythonRunner');
const telegram = require('./telegram');
const { createUploadResultsBlock, appendVideoToUploadBlock, appendResultsBlockFromUpload } = require('./uploadResults');



const SCRIPT_MAP = {

  scan_qr: 'scan_qr.py',

  login: 'login.py',

  warmup: 'warmup.py',

  channel_setup: 'channel_setup.py',

  upload_video: 'upload_video.py',

};



const CDP_MODES = ['warmup', 'channel_setup', 'upload_video', 'login'];



function clampThreads(value) {

  const n = Number(value);

  if (!Number.isFinite(n)) return 1;

  return Math.max(1, Math.min(20, Math.round(n)));

}



function resolveBrowserType(config) {
  return browserProfiles.resolveBrowserType(config?.browserType || config?.browser_type);
}

function extractBrowserError(error, browserType) {
  const conn = browserProfiles.connector(browserType);
  return conn.extractError?.(error) || error.message || String(error);
}

function logAutomation(send, entry) {
  automationCoordinator.pushLog(entry);
  send?.('automation:log', entry);
}

async function notifyUploadTelegram(sessions) {
  if (!store.hasSecret('telegramBotToken') || !store.hasSecret('telegramUserId')) return;
  const published = (sessions || []).filter((s) => s.published && (s.url || s.videoId));
  if (!published.length) return;
  const lines = published.map((s) => {
    const link = s.url || (s.videoId ? `https://youtu.be/${s.videoId}` : '');
    return `${s.login || s.profileId || '?'}: ${link || s.title || s.video || '—'}`;
  });
  const removed = (sessions || []).filter((s) => s.videoRemoved).length;
  const tail = removed ? `\nУдалено из папки: ${removed}` : '';
  try {
    await telegram.sendMessage(
      `<b>Загрузка завершена</b>\nВсего: ${published.length}\n\n${lines.join('\n')}${tail}`,
    );
  } catch { /* optional */ }
}

async function openSessionForProfile(profileId, accountMap, send, browserType) {
  const type = resolveBrowserType({ browserType });
  const acc = accountMap[String(profileId)];
  const label = acc?.login || profileId.slice(0, 8);
  logAutomation(send, { text: `Открываю ${label}…`, level: 'info' });
  const data = await browserProfiles.openBrowser(profileId, type);
  const cdpUrl = data.http || data.cdpUrl || data.ws;
  if (!cdpUrl) throw new Error(`${browserProfiles.CONNECTORS[type].name} не вернул CDP URL`);
  logAutomation(send, { text: `${label}: браузер запущен`, level: 'success' });
  automationCoordinator.bumpStat('active');
  return {
    profileId,
    cdpUrl,
    wsUrl: data.ws,
    accountId: acc?.id,
    login: acc?.login,
    browserType: type,
  };
}

async function closeProfiles(profileIds, browserType) {
  const type = resolveBrowserType({ browserType });
  await Promise.all(profileIds.map(async (profileId) => {
    try {
      await browserProfiles.closeBrowser(profileId, type);
    } catch { /* ignore */ }
  }));
}



async function runUploadVideoSequential({ ids, config, accountMap, send, onUploadSession }) {
  const browserType = resolveBrowserType(config);
  const mergedSessions = [];
  let mergedOk = true;
  let lastError = '';

  send?.('automation:log', {
    text: `Загрузка: ${ids.length} акк. по очереди (1 браузер — меньше нагрузка на RAM)`,
    level: 'info',
  });

  for (let uploadIndex = 0; uploadIndex < ids.length; uploadIndex += 1) {
    const profileId = ids[uploadIndex];
    const acc = accountMap[String(profileId)];
    const label = acc?.login || profileId.slice(0, 8);
    const openedProfiles = [];

    send?.('automation:log', {
      text: `[${uploadIndex + 1}/${ids.length}] ${label}`,
      level: 'info',
    });

    try {
      const session = await openSessionForProfile(profileId, accountMap, send, browserType);
      openedProfiles.push(profileId);

      const progressHandler = (p) => {
        try {
          if (p?.type === 'uploadSession' && p.session) onUploadSession?.(p.session);
          send?.('automation:progress', p);
        } catch { /* ignore */ }
      };

      const runResult = await pythonRunner.runScript(
        'upload_video.py',
        {
          ...config,
          threads: 1,
          profileIds: [profileId],
          sessions: [session],
          uploadIndex,
          uploadTotal: ids.length,
        },
        progressHandler,
        (msg) => {
          try {
            send?.('automation:log', typeof msg === 'string' ? { text: msg, level: 'info' } : msg);
          } catch { /* ignore */ }
        },
      );

      const batchSessions = runResult?.sessions || [];
      mergedSessions.push(...batchSessions);
      for (const s of batchSessions) onUploadSession?.(s);

      if (runResult?.ok === false || batchSessions.some((s) => s.error)) {
        mergedOk = false;
        lastError = batchSessions.map((s) => s.error).filter(Boolean).join('; ')
          || runResult?.error
          || lastError;
      }
    } catch (e) {
      mergedOk = false;
      lastError = e.message;
      mergedSessions.push({ profileId, login: label, error: e.message });
      send?.('automation:log', { text: `${label}: ${e.message}`, level: 'error' });
    } finally {
      const last = (mergedSessions.length && mergedSessions[mergedSessions.length - 1]) || null;
      const keepOpen =
        config.uploadKeepBrowserOnStuck !== false
        && (
          last?.keepBrowserOpen
          || last?.needsManualAssist
          || (config.uploadManualAssist !== false && last && !last.published)
        );
      if (keepOpen) {
        send?.('automation:log', {
          text: `${label}: браузер оставлен открытым — завершите загрузку в Studio вручную (Next / Publish)`,
          level: 'warn',
        });
      } else {
        await closeProfiles(openedProfiles, browserType);
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
  }

  send?.('automation:progress', { stage: 'upload', percent: 100, message: 'Загрузка завершена' });
  return { ok: mergedOk, sessions: mergedSessions, error: mergedOk ? undefined : lastError };
}



async function runPythonAutomationScript({
  mode,
  script,
  config,
  sessions,
  threads,
  send,
  onUploadSession,
}) {
  const progressHandler = (p) => {
    try {
      if (p?.type === 'uploadSession' && p.session) {
        onUploadSession?.(p.session);
      }
      send?.('automation:progress', p);
    } catch (err) {
      send?.('automation:log', { text: `Ошибка прогресса: ${err.message}`, level: 'error' });
    }
  };

  const logHandler = (msg) => {
    try {
      send?.('automation:log', typeof msg === 'string' ? { text: msg, level: 'info' } : msg);
    } catch { /* ignore */ }
  };

  return pythonRunner.runScript(
    script,
    {
      ...config,
      threads: Math.min(threads, sessions.length),
      profileIds: sessions.map((s) => s.profileId),
      sessions,
    },
    progressHandler,
    logHandler,
  );
}



async function runAutomationMode({ mode, profileIds, config, send }) {
  const settings = store.getSettings();
  const { ffmpegPath: defaultFfmpeg } = require('./ffmpeg/pathResolver');
  config = {
    ...config,
    ffmpegPath: config?.ffmpegPath || settings.ffmpegPath || defaultFfmpeg,
  };
  const browserType = resolveBrowserType(config);
  automationCoordinator.setRunning(true, mode);
  automationCoordinator.resetStats();
  automationCoordinator.pushLog({ text: `Старт: ${mode} (${browserProfiles.CONNECTORS[browserType].name})`, level: 'info' });

  const script = SCRIPT_MAP[mode];

  if (!script) {
    automationCoordinator.setRunning(false);
    return { ok: false, error: 'Unknown mode' };
  }



  const ids = (profileIds || config?.profileIds || []).filter(Boolean);

  const threads = clampThreads(config?.threads ?? 1);

  const accountMap = Object.fromEntries(

    (config?.accounts || []).map((a) => [String(a.profileId), a]),

  );



  const mergedSessions = [];

  let mergedOk = true;

  let lastError = '';

  const totalBatches = Math.max(1, Math.ceil(ids.length / threads));

  let uploadResultsBlock = null;
  if (mode === 'upload_video') {
    uploadResultsBlock = createUploadResultsBlock();
    send?.('results:updated', { blockId: uploadResultsBlock.id });
    send?.('automation:log', {
      text: `Результаты: создан блок «${uploadResultsBlock.name}»`,
      level: 'info',
    });
  }

  const onUploadSession = (session) => {
    try {
      if (!uploadResultsBlock || mode !== 'upload_video') return;
      const block = appendVideoToUploadBlock(uploadResultsBlock.id, session);
      if (block) {
        uploadResultsBlock = block;
        send?.('results:updated', { blockId: block.id, added: session.url || session.videoId });
        if (session.url) {
          send?.('automation:log', {
            text: `${session.login || 'профиль'}: + ссылка ${session.url}`,
            level: 'success',
          });
        }
      }
    } catch (err) {
      send?.('automation:log', {
        text: `Результаты: ${err.message}`,
        level: 'error',
      });
    }
  };

  if (mode === 'upload_video') {
    const uploadResult = await runUploadVideoSequential({
      ids,
      config,
      accountMap,
      send,
      onUploadSession,
    });
    mergedSessions.push(...(uploadResult.sessions || []));
    mergedOk = uploadResult.ok !== false;
    lastError = uploadResult.error || '';

    if (uploadResultsBlock) {
      appendResultsBlockFromUpload(uploadResult.sessions || [], { blockId: uploadResultsBlock.id });
      const withLinks = (uploadResult.sessions || []).filter((s) => s.url || s.videoId);
      if (withLinks.length) {
        send?.('results:updated', { blockId: uploadResultsBlock.id });
        send?.('automation:log', {
          text: `Результаты: ${withLinks.length} ссылок в «${uploadResultsBlock.name}»`,
          level: 'success',
        });
      }
    }

    await notifyUploadTelegram(mergedSessions);
    automationCoordinator.setRunning(false);
    return {
      ok: mergedOk,
      sessions: mergedSessions,
      error: mergedOk ? undefined : lastError,
    };
  }

  for (let i = 0; i < ids.length; i += threads) {

    const batchIds = ids.slice(i, i + threads);

    const batchIndex = Math.floor(i / threads) + 1;

    const openedProfiles = [];

    const sessions = [];



    send?.('automation:log', {

      text: `Пакет ${batchIndex}/${totalBatches}: ${batchIds.length} профил(ей), потоков ${Math.min(threads, batchIds.length)}`,

      level: 'info',

    });



    const openResults = await Promise.all(batchIds.map(async (profileId) => {

      try {

        const session = await openSessionForProfile(profileId, accountMap, send, browserType);

        return { ok: true, session, profileId };

      } catch (e) {

        const acc = accountMap[String(profileId)];

        const label = acc?.login || profileId.slice(0, 8);

        send?.('automation:log', {

          text: `Ошибка ${label}: ${extractBrowserError(e, browserType)}`,

          level: 'error',

        });

        return { ok: false, profileId, error: extractBrowserError(e, browserType) };

      }

    }));



    for (const item of openResults) {

      if (item.ok) {

        sessions.push(item.session);

        openedProfiles.push(item.profileId);

      } else {

        mergedOk = false;

        mergedSessions.push({

          profileId: item.profileId,

          error: item.error,

        });

      }

    }



    if (!sessions.length) {

      if (CDP_MODES.includes(mode) && i === 0 && mergedSessions.length === batchIds.length) {

        return { ok: false, error: 'Не удалось открыть ни одного профиля браузера' };

      }

      continue;

    }



    try {

      const runResult = await runPythonAutomationScript({
        mode,
        script,
        config,
        sessions,
        threads,
        send,
        onUploadSession,
      });



      const batchSessions = runResult?.sessions || [];

      mergedSessions.push(...batchSessions);

      if (mode === 'upload_video' && uploadResultsBlock) {
        for (const s of batchSessions) {
          onUploadSession(s);
        }
      }



      const scriptOk = runResult?.ok !== false;

      const sessionErrors = batchSessions.filter((s) => s.error);

      if (!scriptOk || sessionErrors.length) {

        mergedOk = false;

        lastError = sessionErrors.map((s) => s.error).filter(Boolean).join('; ')

          || runResult?.error

          || 'Ошибка выполнения скрипта';

      }

    } catch (e) {

      mergedOk = false;

      lastError = e.message;

      for (const session of sessions) {

        mergedSessions.push({

          profileId: session.profileId,

          login: session.login,

          error: e.message,

        });

      }

    } finally {

      await closeProfiles(openedProfiles, browserType);

    }

  }



  const sessionErrors = mergedSessions.filter((s) => s.error);

  let resultsBlock = uploadResultsBlock;
  if (mode === 'upload_video' && uploadResultsBlock) {
    appendResultsBlockFromUpload(mergedSessions, { blockId: uploadResultsBlock.id });
    const fresh = store.getResults().blocks.find((b) => b.id === uploadResultsBlock.id);
    if (fresh) resultsBlock = fresh;
    if (resultsBlock?.videos?.length) {
      send?.('automation:log', {
        text: `Результаты: в блоке ${resultsBlock.videos.length} ссылок`,
        level: 'success',
      });
      send?.('results:updated', { blockId: resultsBlock.id });
    }
  }

  if (!mergedOk || sessionErrors.length) {
    automationCoordinator.setRunning(false);
    return {
      ok: false,
      error: lastError || sessionErrors.map((s) => s.error).filter(Boolean).join('; '),
      result: { sessions: mergedSessions, resultsBlock },
    };
  }

  automationCoordinator.setRunning(false);
  automationCoordinator.bumpStat('success');
  return { ok: true, result: { sessions: mergedSessions, resultsBlock } };
}



async function runStudioDebug({ profileIds, config, send, waitSeconds = 120 }) {
  const browserType = resolveBrowserType(config);

  const ids = (profileIds || config?.profileIds || []).filter(Boolean);

  if (!ids.length) return { ok: false, error: 'Выберите профиль' };



  const accountMap = Object.fromEntries(

    (config?.accounts || []).map((a) => [String(a.profileId), a]),

  );

  const sessions = [];

  const openedProfiles = [];

  const path = require('path');



  for (const profileId of ids.slice(0, 1)) {

    try {

      const acc = accountMap[String(profileId)];

      const label = acc?.login || profileId.slice(0, 8);

      send?.('automation:log', { text: `Диагностика: открываю ${label}…`, level: 'info' });

      const data = await browserProfiles.openBrowser(profileId, browserType);

      const cdpUrl = data.http || data.cdpUrl || data.ws;

      if (!cdpUrl) throw new Error('MostLogin не вернул CDP URL');

      sessions.push({

        profileId,

        cdpUrl,

        login: acc?.login,

      });

      openedProfiles.push(profileId);

    } catch (e) {

      return { ok: false, error: extractBrowserError(e, browserType) };

    }

  }



  const outputDir = path.join(__dirname, '..', '..', 'debug');

  try {

    fs.mkdirSync(outputDir, { recursive: true });

    send?.('automation:log', { text: `Диагностика: файлы → ${outputDir}`, level: 'info' });

    const runResult = await pythonRunner.runScript(

      'debug_studio_dom.py',

      {

        profileIds: ids,

        sessions,

        waitSeconds,

        outputDir,

        targetUrl: 'https://studio.youtube.com/channel/me/editing/profile',

      },

      (p) => send?.('automation:progress', p),

      (msg) => send?.('automation:log', typeof msg === 'string' ? { text: msg, level: 'info' } : msg),

    );

    return { ok: true, result: runResult, path: path.join(outputDir, 'studio-dom-debug.json') };

  } catch (e) {

    return { ok: false, error: e.message, path: path.join(outputDir, 'studio-dom-debug.json') };

  } finally {

    await closeProfiles(openedProfiles, browserType);

  }

}



function sleepPC() {

  if (process.platform === 'win32') {

    exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0');

  } else if (process.platform === 'darwin') {

    exec('pmset sleepnow');

  } else {

    exec('systemctl suspend');

  }

}



function buildRunKey() {

  const now = new Date();

  return `${now.toISOString().slice(0, 16)}`;

}



async function runTask(taskId, send) {

  const tasks = store.getTasks();

  const task = (tasks.active || []).find((t) => t.id === taskId);

  if (!task) return { ok: false, error: 'Задача не найдена' };

  if (task.status === 'running') return { ok: false, error: 'Задача уже выполняется' };



  const updated = {

    ...tasks,

    active: tasks.active.map((t) => (t.id === taskId ? { ...t, status: 'running' } : t)),

  };

  store.setTasks(updated);

  send?.('tasks:status', { taskId, status: 'running' });



  let successCount = 0;

  let failCount = 0;

  const profiles = task.profileIds || [];

  const chain = task.chain || [];



  send?.('tasks:log', { taskId, text: `Запуск «${task.name}»`, level: 'info' });



  for (const mode of chain) {

    send?.('tasks:log', { taskId, text: `Режим: ${mode}`, level: 'info' });

    const config = {

      ...(task.automationConfig || {}),

      threads: task.threads || 1,

      profileIds: profiles,

    };

    const result = await runAutomationMode({

      mode,

      profileIds: profiles,

      config,

      send,

    });

    if (result.ok) successCount += Math.max(profiles.length, 1);

    else failCount += Math.max(profiles.length, 1);

  }



  const archived = {

    ...task,

    status: 'completed',

    completedAt: new Date().toISOString(),

    lastRunAt: new Date().toISOString(),

    successCount,

    failCount,

  };



  const fresh = store.getTasks();

  const next = {

    active: (fresh.active || []).filter((t) => t.id !== taskId),

    archive: [archived, ...(fresh.archive || [])],

  };

  store.setTasks(next);

  send?.('tasks:status', { taskId, status: 'completed', successCount, failCount });



  if (task.sleepAfter) {

    send?.('tasks:log', { taskId, text: 'Переход ПК в режим сна…', level: 'info' });

    sleepPC();

  }



  return { ok: true, successCount, failCount };

}



function parseScheduleDate(str) {

  if (!str || typeof str !== 'string') return null;

  const m = str.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

  if (!m) return null;

  return `${m[3]}-${m[2]}-${m[1]}`;

}



function shouldRunScheduledTask(task, now) {

  if (!task.scheduleEnabled) return false;

  const hh = String(now.getHours()).padStart(2, '0');

  const mm = String(now.getMinutes()).padStart(2, '0');

  const time = task.scheduleTime || task.time || '12:00';

  if (time !== `${hh}:${mm}`) return false;



  const runKey = buildRunKey();

  if (task.lastScheduledKey === runKey) return false;



  if (task.repeatDaily) return true;



  const isoDate = parseScheduleDate(task.scheduleDate);

  if (!isoDate) return false;

  const today = now.toISOString().slice(0, 10);

  return isoDate === today;

}



async function checkScheduledTasks(send) {

  const tasks = store.getTasks();

  const now = new Date();

  const runKey = buildRunKey();

  let changed = false;



  for (const task of tasks.active || []) {

    if (!shouldRunScheduledTask(task, now)) continue;

    changed = true;

    const marked = {

      ...tasks,

      active: tasks.active.map((t) => (

        t.id === task.id ? { ...t, lastScheduledKey: runKey } : t

      )),

    };

    store.setTasks(marked);

    await runTask(task.id, send);

  }



  return changed;

}



module.exports = {

  runAutomationMode,

  runStudioDebug,

  runTask,

  sleepPC,

  checkScheduledTasks,

  SCRIPT_MAP,

};

