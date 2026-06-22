/**
 * TechPro — Electron main process
 */
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const store = require('./services/store');
const youtube = require('./services/youtube');
const mostlogin = require('./services/mostlogin');
const browserProfiles = require('./services/browserProfiles');
const automationCoordinator = require('./services/automationCoordinator');
const statsCollector = require('./services/statsCollector');
const telegram = require('./services/telegram');
const deepseek = require('./services/deepseek');
const tiktok = require('./services/tiktok');
const tiktokRunner = require('./services/tiktokRunner');
const spaceproxy = require('./services/spaceproxy');
const pythonRunner = require('./services/pythonRunner');
const backup = require('./services/backup');
const fileExport = require('./services/fileExport');
const taskScheduler = require('./services/taskScheduler');
const taskRunner = require('./services/taskRunner');
const { processor: uniqueizerProcessor } = require('./services/uniqueizer');
const { getMediaInfo } = require('./services/ffmpeg/probe');
const { METHOD_CATALOG, getRecommendedDefaults } = require('./services/ffmpeg/methodCatalog');
const { getPreset } = require('./services/ffmpeg/presets');
const { getPythonStatus, installPythonDeps } = require('./services/python/runtime');
const { listPresets, savePreset, loadPreset, deletePreset } = require('./services/userPresets');
const accountChecker = require('./services/accountChecker');
const accountImport = require('./services/accountImport');
const profileMaintenance = require('./services/profileMaintenance');
const analytics = require('./services/analytics');
const resultsChecker = require('./services/resultsChecker');
const {
  buildResultsExportRows,
  buildAnalyticsSnapshotRows,
  buildTopVideosExportRows,
} = require('./services/resultsMerge');
const { ffmpegPath } = require('./services/ffmpeg/pathResolver');
const { getSystemStatus } = require('./services/systemCheck');
const { generateTotp, isTotpSecret } = require('./services/totp');
const { autofillTotpForAccount } = require('./services/totpAutofill');
const autoBackup = require('./services/autoBackup');
const appUpdater = require('./services/appUpdater');

const isDev = !app.isPackaged;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let checkerAbort = null;
let createProfilesAbort = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

function send(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

// Window
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

// Settings
ipcMain.handle('settings:get', () => ({
  settings: store.getSettings(),
  secrets: {
    hasYoutubeKey: store.hasSecret('youtubeKey'),
    hasMostloginKey: store.hasSecret('mostloginKey'),
    hasVisionKey: store.hasSecret('visionKey'),
    hasZennoKey: store.hasSecret('zennoKey'),
    hasSpaceproxyKey: store.hasSecret('spaceproxyKey'),
    hasDeepseekKey: store.hasSecret('deepseekKey'),
    hasTelegram: store.hasSecret('telegramBotToken') && store.hasSecret('telegramUserId'),
  },
  safeStorageAvailable: store.isSafeStorageAvailable(),
}));

ipcMain.handle('settings:update', (_, partial) => {
  store.updateSettings(partial);
  taskScheduler.restartAutoChecker((channel, data) => send(channel, data));
  statsCollector.restart((channel, data) => send(channel, data));
  autoBackup.restart();
  return store.getSettings();
});

ipcMain.handle('settings:setSecret', (_, { key, value }) => {
  store.setSecret(key, value);
  return { ok: true };
});

ipcMain.handle('settings:reset', () => ({ settings: store.resetSettings() }));

// TikTok module (Phase 1 stubs)
ipcMain.handle('tiktok:get', () => tiktok.getTiktok());
ipcMain.handle('tiktok:set', (_, data) => tiktok.setTiktok(data));
ipcMain.handle('tiktok:commentStats', () => tiktok.getCommentStats());
ipcMain.handle('tiktok:automation:status', () => tiktok.getAutomationStatus());
ipcMain.handle('tiktok:automation:logs', (_, limit) => tiktok.getAutomationLogs(limit));
ipcMain.handle('tiktok:automation:run', async (_, opts) => {
  try {
    return await tiktok.runAutomation(opts, (channel, data) => send(channel, data));
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('tiktok:automation:stop', () => tiktok.stopAutomation());

ipcMain.handle('profiles:updateTiktokMeta', (_, { profileId, ...patch }) => {
  if (!profileId) return { ok: false, error: 'profileId required' };
  tiktokRunner.updateTiktokMeta(profileId, patch);
  return { ok: true };
});

ipcMain.handle('tiktok:detectLogin', async (_, opts) => {
  try {
    return await tiktokRunner.detectLogin(opts, (channel, data) => send(channel, data));
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('tiktok:detectLogin:cancel', () => tiktokRunner.cancelAutomation());

ipcMain.handle('settings:validateYoutube', async () => {
  const apiKey = store.getSecret('youtubeKey');
  if (!apiKey) return { valid: false, error: 'No key' };
  try {
    await youtube.validateKey(apiKey);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e.message };
  }
});

ipcMain.handle('settings:testAi', () => deepseek.testConnection());

// System
ipcMain.handle('system:status', async () => getSystemStatus(store.getSettings()));

// MostLogin
ipcMain.handle('mostlogin:test', () => mostlogin.testConnection());
ipcMain.handle('mostlogin:listProfiles', async () => {
  try {
    const data = await mostlogin.getProfileList(1, 200);
    const list = data?.list || data?.data || data?.profiles || [];
    const meta = store.getProfiles().meta;
    return { ok: true, profiles: list.map((p) => {
      const id = p.id || p.profileId;
      const m = meta[id] || {};
      return {
        ...p,
        id,
        localStatus: m.status || 'none',
        channelName: m.channelName || p.title || '',
        linkedAccountId: m.linkedAccountId || null,
        linkedEmail: m.linkedEmail || null,
      };
    }) };
  } catch (e) {
    return { ok: false, error: e.message, profiles: [] };
  }
});

ipcMain.handle('mostlogin:open', async (_, profileId) => {
  try {
    const data = await mostlogin.openBrowser(profileId);
    return { ok: true, ...data };
  } catch (e) {
    return { ok: false, error: mostlogin.extractError(e) };
  }
});

ipcMain.handle('mostlogin:close', async (_, profileId) => {
  try {
    await mostlogin.closeBrowser(profileId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mostlogin.extractError(e) };
  }
});

ipcMain.handle('mostlogin:delete', async (_, profileIds) => {
  try {
    await mostlogin.deleteProfiles(profileIds);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('mostlogin:createBulk', async (_, opts) => {
  createProfilesAbort = false;
  try {
    const folders = await mostlogin.getFolderList();
    const folderList = folders?.list || folders?.data || folders?.folders || [];
    const folderId = opts.folderId || folderList[0]?.id;
    if (!folderId) return { ok: false, error: 'No folder in MostLogin' };

    const result = await mostlogin.bulkCreateProfiles({
      ...opts,
      folderId,
      onProgress: (p) => send('profiles:createProgress', p),
    });
    if (createProfilesAbort) return { ok: false, cancelled: true };
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('mostlogin:cancelCreate', () => {
  createProfilesAbort = true;
  return { ok: true };
});

// Multi-browser (MostLogin / Vision / Zenno)
ipcMain.handle('browser:test', async (_, { browserType } = {}) => {
  try {
    return await browserProfiles.testConnection(browserType);
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('browser:listProfiles', async (_, { browserType } = {}) => {
  try {
    const profiles = await browserProfiles.listProfiles(browserType);
    return { ok: true, profiles, browserType: browserProfiles.resolveBrowserType(browserType) };
  } catch (e) {
    return { ok: false, error: e.message, profiles: [] };
  }
});

ipcMain.handle('browser:listFolders', async (_, { browserType } = {}) => {
  try {
    const folders = await browserProfiles.listFolders(browserType);
    return { ok: true, folders };
  } catch (e) {
    return { ok: false, error: e.message, folders: [] };
  }
});

ipcMain.handle('browser:open', async (_, { profileId, browserType } = {}) => {
  try {
    const data = await browserProfiles.openBrowser(profileId, browserType);
    return { ok: true, ...data };
  } catch (e) {
    const type = browserProfiles.resolveBrowserType(browserType);
    return { ok: false, error: browserProfiles.connector(type).extractError?.(e) || e.message };
  }
});

ipcMain.handle('browser:close', async (_, { profileId, browserType } = {}) => {
  try {
    await browserProfiles.closeBrowser(profileId, browserType);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('browser:delete', async (_, { profileIds, browserType } = {}) => {
  try {
    await browserProfiles.deleteProfiles(profileIds, browserType);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('browser:createBulk', async (_, opts) => {
  createProfilesAbort = false;
  try {
    const result = await browserProfiles.bulkCreateProfiles(
      { ...opts, shouldAbort: () => createProfilesAbort },
      (event) => send('profiles:createProgress', event),
    );
    if (createProfilesAbort) return { ok: false, cancelled: true };
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('browser:createFolder', async (_, { payload, browserType } = {}) => {
  try {
    const data = await browserProfiles.createFolder(payload, browserType);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('browser:moveToFolder', async (_, { profileIds, folderId, browserType } = {}) => {
  try {
    await browserProfiles.moveProfilesToFolder(profileIds, folderId, browserType);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('browser:fetchSpaceProxies', async (_, { count, maxPerProxy, browserType } = {}) => {
  try {
    return await browserProfiles.fetchSpaceProxiesForBrowser({ count, maxPerProxy, browserType });
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('mostlogin:listFolders', async () => {
  try {
    const data = await mostlogin.getFolderList(1, 200);
    const list = data?.list || data?.data || [];
    return { ok: true, folders: list };
  } catch (e) {
    return { ok: false, error: e.message, folders: [] };
  }
});

ipcMain.handle('mostlogin:createFolder', async (_, payload) => {
  try {
    const data = await mostlogin.createFolder(payload);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: mostlogin.extractError(e) };
  }
});

ipcMain.handle('mostlogin:moveToFolder', async (_, { profileIds, folderId }) => {
  try {
    await mostlogin.moveProfilesToFolder(profileIds, folderId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mostlogin.extractError(e) };
  }
});

ipcMain.handle('profiles:updateStatus', async (_, { profileId, status, channelName, notes }) => {
  const profiles = store.getProfiles();
  const meta = { ...profiles.meta };
  meta[profileId] = {
    ...meta[profileId],
    ...(status !== undefined ? { status } : {}),
    ...(channelName !== undefined ? { channelName } : {}),
    ...(notes !== undefined ? { notes } : {}),
  };
  store.setProfiles({ ...profiles, meta });
  return { ok: true };
});

ipcMain.handle('profiles:linkAccount', async (_, { profileId, accountId, accountEmail, blockId }) => {
  const profiles = store.getProfiles();
  const meta = { ...profiles.meta };

  const prevLinked = meta[profileId]?.linkedAccountId;
  if (prevLinked && prevLinked !== accountId) {
    const accountsData = store.getAccounts();
    store.setAccounts({
      ...accountsData,
      blocks: accountsData.blocks.map((b) => ({
        ...b,
        accounts: b.accounts.map((a) => (
          a.id === prevLinked ? { ...a, profileId: undefined } : a
        )),
      })),
    });
  }

  if (accountId) {
    meta[profileId] = {
      ...meta[profileId],
      linkedAccountId: accountId,
      linkedEmail: accountEmail || null,
    };
  } else {
    const cur = { ...meta[profileId] };
    delete cur.linkedAccountId;
    delete cur.linkedEmail;
    meta[profileId] = cur;
  }
  store.setProfiles({ ...profiles, meta });

  if (accountId && blockId) {
    const accountsData = store.getAccounts();
    store.setAccounts({
      ...accountsData,
      blocks: accountsData.blocks.map((b) => (b.id !== blockId ? b : {
        ...b,
        accounts: b.accounts.map((a) => (
          a.id === accountId ? { ...a, profileId } : { ...a, profileId: a.profileId === profileId ? undefined : a.profileId }
        )),
      })),
    });
  }

  return { ok: true };
});

ipcMain.handle('mostlogin:replaceProxies', async (_, opts) => (
  browserProfiles.assignProxiesToProfiles({ ...opts, mode: opts?.mode || 'sequential' })
));

ipcMain.handle('browser:assignProxies', async (_, opts) => (
  browserProfiles.assignProxiesToProfiles(opts)
));

// Profiles meta
ipcMain.handle('profiles:get', () => store.getProfiles());
ipcMain.handle('profiles:set', (_, data) => { store.setProfiles(data); return { ok: true }; });
ipcMain.handle('profiles:updateSelection', (_, { selectedIds }) => {
  const ids = store.updateProfileSelection(selectedIds);
  return { ok: true, selectedIds: ids };
});
ipcMain.handle('profiles:deadProxies', () => store.getDeadProxies());
ipcMain.handle('profiles:setDeadProxies', (_, list) => { store.setDeadProxies(list); return { ok: true }; });
ipcMain.handle('profiles:getDeadProxyProfiles', async () => {
  try {
    const matches = await profileMaintenance.getDeadProxyProfiles();
    return { ok: true, profiles: matches };
  } catch (e) {
    return { ok: false, error: e.message, profiles: [] };
  }
});
ipcMain.handle('profiles:replaceDeadProxies', async (_, opts = {}) => {
  try {
    return await profileMaintenance.replaceDeadProxies({
      ...opts,
      send: (channel, data) => send(channel, data),
    });
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('profiles:replaceBans', async (_, opts = {}) => {
  try {
    return await profileMaintenance.replaceBans({
      ...opts,
      send: (channel, data) => send(channel, data),
    });
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Space Proxy
ipcMain.handle('spaceproxy:fetch', async (_, count, opts = {}) => {
  try {
    if (opts.browserType || opts.maxPerProxy) {
      return await browserProfiles.fetchSpaceProxiesForBrowser({
        count,
        maxPerProxy: opts.maxPerProxy,
        browserType: opts.browserType,
      });
    }
    const proxies = await spaceproxy.fetchProxies(count);
    return { ok: true, proxies };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('spaceproxy:parseFile', async () => {
  const text = await fileExport.importTxt(mainWindow);
  if (!text) return { ok: false };
  return { ok: true, proxies: spaceproxy.parseProxyLines(text) };
});

// Accounts
ipcMain.handle('accounts:get', () => store.getAccounts());
ipcMain.handle('accounts:set', (_, data) => { store.setAccounts(data); return { ok: true }; });
ipcMain.handle('accounts:parseImport', (_, text) => accountImport.parseAccountText(text || ''));
ipcMain.handle('accounts:exportCsv', async (_, { blockId } = {}) => {
  const rows = accountImport.buildExportRows(store.getAccounts(), { blockId, maskSecrets: true });
  if (!rows.length) return { ok: false, error: 'Нет аккаунтов для экспорта' };
  const name = `accounts-${new Date().toISOString().slice(0, 10)}.csv`;
  const filePath = await backup.exportCsv(mainWindow, rows, name);
  return filePath ? { ok: true, path: filePath } : { ok: false, cancelled: true };
});
ipcMain.handle('accounts:check', async (_, opts) => {
  return accountChecker.checkAccounts(opts || {}, (channel, data) => send(channel, data));
});
ipcMain.handle('totp:generate', (_, secret) => generateTotp(secret));
ipcMain.handle('totp:isSecret', (_, secret) => ({ ok: isTotpSecret(secret) }));
ipcMain.handle('totp:autofill', async (_, { accountId }) => {
  try {
    return await autofillTotpForAccount(accountId, (channel, data) => send(channel, data));
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('clipboard:copy', (_, text) => fileExport.copyToClipboard(text));

// Automation presets
ipcMain.handle('automation:presets', () => store.getAutomationPresets());
ipcMain.handle('automation:savePreset', (_, preset) => store.saveAutomationPreset(preset));
ipcMain.handle('automation:deletePreset', (_, id) => store.deleteAutomationPreset(id));
ipcMain.handle('automation:draft:get', (_, { module } = {}) => store.getAutomationDraft(module));
ipcMain.handle('automation:draft:update', (_, { module, partial } = {}) => (
  store.updateAutomationDraft(module, partial || {})
));

ipcMain.handle('automation:run', async (_, { mode, config, profileIds }) => {
  return taskRunner.runAutomationMode({
    mode,
    config,
    profileIds,
    send: (channel, data) => send(channel, data),
  });
});

ipcMain.handle('automation:debugStudio', async (_, { profileIds, config, waitSeconds }) => {
  return taskRunner.runStudioDebug({
    profileIds,
    config,
    waitSeconds,
    send: (channel, data) => send(channel, data),
  });
});

ipcMain.handle('automation:cancel', () => {
  pythonRunner.cancelJob();
  automationCoordinator.setRunning(false);
  return { ok: true };
});

ipcMain.handle('automation:status', () => automationCoordinator.getStatus());
ipcMain.handle('automation:logs', (_, limit) => ({ logs: automationCoordinator.getLogs(limit || 200) }));

ipcMain.handle('stats:collectNow', async () => {
  return statsCollector.collectSnapshot((channel, data) => send(channel, data));
});

// Tasks
ipcMain.handle('tasks:get', () => store.getTasks());
ipcMain.handle('tasks:set', (_, data) => { store.setTasks(data); return { ok: true }; });
ipcMain.handle('tasks:run', async (_, taskId) => {
  return taskRunner.runTask(taskId, (channel, data) => send(channel, data));
});
ipcMain.handle('system:sleep', () => {
  taskRunner.sleepPC();
  return { ok: true };
});

// Jokes
ipcMain.handle('jokes:generate', async (_, config) => {
  try {
    const settings = store.getSettings();
    const ff = (settings.ffmpegPath && fs.existsSync(settings.ffmpegPath))
      ? settings.ffmpegPath
      : ffmpegPath();
    const result = await pythonRunner.runScript(
      'joke_generator.py',
      { ...config, ffmpegPath: ff },
      (p) => send('jokes:progress', p),
      (msg) => send('jokes:log', msg),
      { extraEnv: { FFMPEG_PATH: ff } },
    );
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Uniqueizer (VideoUniquer Pro pipeline)
ipcMain.handle('uniqueizer:openVideo', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Выберите видео или фото',
    filters: [
      { name: 'Все медиа', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'] },
      { name: 'Видео', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv'] },
      { name: 'Фото', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'] },
      { name: 'Все файлы', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('uniqueizer:openVideos', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Выберите файлы (можно несколько)',
    filters: [
      { name: 'Все медиа', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'] },
      { name: 'Видео', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv'] },
      { name: 'Фото', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'] },
      { name: 'Все файлы', extensions: ['*'] },
    ],
    properties: ['openFile', 'multiSelections'],
  });
  if (result.canceled || !result.filePaths.length) return [];
  return result.filePaths;
});

ipcMain.handle('uniqueizer:openOutputDir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Папка для сохранения копий',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('uniqueizer:probe', async (_, filePath) => {
  try {
    return { ok: true, data: await getMediaInfo(filePath) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('uniqueizer:process', async (_, opts) => uniqueizerProcessor.start(opts));

ipcMain.handle('uniqueizer:cancel', () => {
  uniqueizerProcessor.cancel();
  return { ok: true };
});

ipcMain.handle('uniqueizer:presetList', () => listPresets());

ipcMain.handle('uniqueizer:presetSave', (_, { name, data }) => {
  try {
    return savePreset(name, data);
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('uniqueizer:presetLoad', (_, name) => loadPreset(name));

ipcMain.handle('uniqueizer:presetDelete', (_, name) => {
  try {
    return deletePreset(name);
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('uniqueizer:getCatalog', () => ({ catalog: METHOD_CATALOG }));

ipcMain.handle('uniqueizer:getRecommended', (_, maxMode) => getRecommendedDefaults(!!maxMode));

ipcMain.handle('uniqueizer:getDefaults', (_, maxMode) => getPreset(!!maxMode));

ipcMain.handle('uniqueizer:pythonStatus', async () => getPythonStatus());

ipcMain.handle('uniqueizer:installPythonDeps', async () => {
  try {
    await installPythonDeps((text) => send('uniqueizer:log', { text: text.trim(), level: 'info' }));
    const status = await getPythonStatus();
    return { ok: status.adversarialDeps || status.faceDeps, status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

uniqueizerProcessor.on('log', (text, level) => send('uniqueizer:log', { text, level }));
uniqueizerProcessor.on('copyProgress', (data) => send('uniqueizer:copyProgress', data));
uniqueizerProcessor.on('totalProgress', (pct) => send('uniqueizer:totalProgress', { percent: pct }));
uniqueizerProcessor.on('copyDone', (data) => send('uniqueizer:copyDone', data));
uniqueizerProcessor.on('allDone', (data) => send('uniqueizer:allDone', data));
uniqueizerProcessor.on('error', (msg) => send('uniqueizer:error', { message: msg }));
uniqueizerProcessor.on('started', () => send('uniqueizer:started'));
uniqueizerProcessor.on('stopped', () => send('uniqueizer:stopped'));


// Checker / Results
ipcMain.handle('checker:run', async (_, { videoIds, linksText }) => {
  const apiKey = store.getSecret('youtubeKey');
  if (!apiKey) return { ok: false, error: 'YouTube API key not set', code: 'NO_KEY' };

  checkerAbort = new AbortController();
  try {
    let result;
    if (videoIds?.length) {
      result = await youtube.runCheckerOnIds(videoIds, apiKey, (p) => send('checker:progress', p), checkerAbort.signal);
    } else {
      result = await youtube.runChecker(linksText, apiKey, (p) => send('checker:progress', p), checkerAbort.signal);
    }
    return { ok: true, ...result, cancelled: checkerAbort.signal.aborted };
  } catch (e) {
    return { ok: false, error: e.message, code: e.code };
  } finally {
    checkerAbort = null;
  }
});

ipcMain.handle('checker:cancel', () => {
  checkerAbort?.abort();
  return { ok: true };
});

ipcMain.handle('checker:runNow', async () => {
  const res = await taskScheduler.runAutoChecker((channel, data) => send(channel, data));
  return res?.ok !== false ? { ok: true, ...res } : res;
});

ipcMain.handle('checker:runBlocks', async (_, opts = {}) => {
  const apiKey = store.getSecret('youtubeKey');
  if (!apiKey) return { ok: false, error: 'YouTube API key not set', code: 'NO_KEY' };

  checkerAbort = new AbortController();
  try {
    const result = await resultsChecker.runCheckerOnBlocks({
      ...opts,
      apiKey,
      onProgress: (p) => send('checker:progress', p),
      signal: checkerAbort.signal,
    });
    if (result.ok) {
      send('results:updated', { blockIds: result.blockIds, source: 'checker' });
    }
    return { ...result, cancelled: checkerAbort.signal.aborted };
  } catch (e) {
    return { ok: false, error: e.message, code: e.code };
  } finally {
    checkerAbort = null;
  }
});

ipcMain.handle('results:get', () => store.getResults());
ipcMain.handle('results:set', (_, data) => { store.setResults(data); return { ok: true }; });
ipcMain.handle('results:exportCsv', async (_, { blockId, allBlocks } = {}) => {
  const { blocks } = store.getResults();
  const rows = buildResultsExportRows(blocks, { blockId, allBlocks });
  if (!rows.length) return { ok: false, error: 'Нет видео для экспорта' };
  const name = allBlocks
    ? `results-all-${new Date().toISOString().slice(0, 10)}.csv`
    : `${blocks.find((b) => b.id === blockId)?.name || 'results'}.csv`;
  const filePath = await backup.exportCsv(mainWindow, rows, name);
  return filePath ? { ok: true, path: filePath } : { ok: false, cancelled: true };
});

// Analytics
ipcMain.handle('analytics:get', (_, daysRange = 30) => {
  const { blocks } = store.getResults();
  const cache = store.getAnalyticsCache();
  if (cache?.totals && cache?.daysRange === daysRange) {
    return { ok: true, fromCache: true, ...cache };
  }
  const computed = analytics.computeAnalytics(blocks, daysRange);
  return { ok: true, ...computed };
});

ipcMain.handle('analytics:getCache', () => store.getAnalyticsCache());

ipcMain.handle('analytics:refresh', async (_, daysRange = 30) => {
  const apiKey = store.getSecret('youtubeKey');
  if (!apiKey) return { ok: false, error: 'YouTube API ключ не задан' };

  const { blocks } = store.getResults();
  const eligible = analytics.getEligibleBlocks(blocks);
  if (!eligible.length) {
    const computed = analytics.computeAnalytics(blocks, daysRange);
    store.setAnalyticsCache(computed);
    return { ok: true, ...computed };
  }

  try {
    const computed = await analytics.refreshAnalytics(
      apiKey,
      (p) => send('checker:progress', p),
      daysRange,
      { persist: true },
    );
    const final = {
      ...computed,
      daysRange: daysRange || 30,
      lastUpdated: new Date().toISOString(),
    };
    store.setAnalyticsCache(final);
    send('results:updated', { source: 'analyticsRefresh' });
    return { ok: true, ...final };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('analytics:exportCsv', async (_, { mode, daysRange } = {}) => {
  const { blocks } = store.getResults();
  const computed = analytics.computeAnalytics(blocks, daysRange || 30);
  const rows = mode === 'snapshot'
    ? buildAnalyticsSnapshotRows(computed)
    : buildTopVideosExportRows(computed.topVideos);
  if (!rows.length) return { ok: false, error: 'Нет данных для экспорта' };
  const name = mode === 'snapshot'
    ? `analytics-${new Date().toISOString().slice(0, 10)}.csv`
    : 'analytics-top.csv';
  const filePath = await backup.exportCsv(mainWindow, rows, name);
  return filePath ? { ok: true, path: filePath } : { ok: false, cancelled: true };
});

// Telegram / AI (OpenRouter, DeepSeek, …)
ipcMain.handle('telegram:test', () => telegram.testConnection());

function wrapAiCall(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      throw new Error(e?.message || 'Ошибка AI запроса');
    }
  };
}

const registerAiHandler = (name, fn) => {
  const handler = wrapAiCall(fn);
  ipcMain.handle(`ai:${name}`, handler);
  ipcMain.handle(`deepseek:${name}`, handler);
};

registerAiHandler('generateNames', (_, { topic, count, examples }) => deepseek.generateChannelNames(topic, count, examples));
registerAiHandler('generateDescriptions', (_, { topic, count, examples }) => deepseek.generateChannelDescriptions(topic, count, examples));
registerAiHandler('generateTitles', (_, { examples, count }) => deepseek.generateVideoTitles(examples, count));
registerAiHandler('generateTags', (_, { title, count }) => deepseek.generateVideoTags(title, count));
registerAiHandler('generateOverlayPairs', (_, { count, examples }) => deepseek.generateOverlayPairs(count, examples));

// Backup
ipcMain.handle('backup:create', () => backup.createBackup(mainWindow));
ipcMain.handle('backup:restore', () => backup.restoreBackup(mainWindow));
ipcMain.handle('backup:export', (_, rows, name) => backup.exportCsv(mainWindow, rows, name));

// Dialogs
ipcMain.handle('dialog:folder', (_, options) => fileExport.openFolder(mainWindow, options));
ipcMain.handle('dialog:images', (_, options) => fileExport.openImages(mainWindow, options));
ipcMain.handle('dialog:videos', (_, options) => fileExport.openVideos(mainWindow, options));
ipcMain.handle('dialog:file', (_, filters) => fileExport.openFile(mainWindow, filters));
ipcMain.handle('dialog:importTxt', () => fileExport.importTxt(mainWindow));

ipcMain.handle('fs:countFiles', (_, { dir, extensions, recursive }) => {
  const fs = require('fs');
  const path = require('path');
  try {
    if (!dir || !fs.existsSync(dir)) return { count: 0 };
    const exts = (extensions || []).map((e) => e.toLowerCase());
    const matches = (name) => {
      const lower = name.toLowerCase();
      return exts.some((ext) => lower.endsWith(ext));
    };
    const walk = (folder, depth) => {
      let count = 0;
      for (const name of fs.readdirSync(folder)) {
        const full = path.join(folder, name);
        let stat;
        try { stat = fs.statSync(full); } catch { continue; }
        if (stat.isFile() && matches(name)) count += 1;
        else if (recursive && stat.isDirectory() && depth > 0) count += walk(full, depth - 1);
      }
      return count;
    };
    const count = walk(dir, recursive ? 2 : 0);
    return { count };
  } catch {
    return { count: 0 };
  }
});

ipcMain.handle('shell:openExternal', (_, url) => {
  if (url?.startsWith('http')) shell.openExternal(url);
});

// App updates (GitHub Releases)
ipcMain.handle('updater:status', () => appUpdater.getStatus());
ipcMain.handle('updater:check', () => appUpdater.checkForUpdates(true));
ipcMain.handle('updater:download', () => appUpdater.downloadUpdate());
ipcMain.handle('updater:install', () => appUpdater.quitAndInstall());
ipcMain.handle('updater:dismiss', (_, version) => appUpdater.dismissVersion(version));
ipcMain.handle('changelog:dismiss', (_, version) => appUpdater.dismissChangelog(version));
ipcMain.handle('updater:setAutoEnabled', (_, enabled) => appUpdater.setAutoUpdateEnabled(enabled));

ipcMain.handle('shell:openPath', (_, dirPath) => shell.openPath(dirPath));

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  createWindow();
  const sendFn = (channel, data) => send(channel, data);
  taskScheduler.startScheduler(sendFn);
  statsCollector.start(sendFn);
  autoBackup.restart();
  appUpdater.init(sendFn);
  appUpdater.scheduleStartupCheck(5000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
