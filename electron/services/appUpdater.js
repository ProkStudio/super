/**
 * TechPro — автообновление через GitHub Releases (electron-updater).
 * Данные пользователя в AppData не затрагиваются — обновляется только папка установки.
 */
const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
const store = require('./store');

const isDev = !app.isPackaged;
let sendFn = null;
let pendingInfo = null;
let manualCheckPending = false;

function getCfg() {
  return store.getSettings().autoUpdate || {};
}

function isAutoEnabled() {
  return !!getCfg().enabled;
}

function shouldNotifyForVersion(version) {
  if (!version) return true;
  const dismissed = getCfg().dismissedVersion;
  return dismissed !== version;
}

function emit(channel, payload) {
  sendFn?.(channel, payload);
}

function normalizeReleaseNotes(notes) {
  if (!notes) return '';
  if (typeof notes === 'string') return notes;
  if (Array.isArray(notes)) {
    return notes.map((n) => (typeof n === 'string' ? n : n?.note || '')).filter(Boolean).join('\n\n');
  }
  return String(notes);
}

function configureUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('checking-for-update', () => {
    emit('updater:status', { status: 'checking' });
  });

  autoUpdater.on('update-not-available', () => {
    emit('updater:status', {
      status: 'not-available',
      currentVersion: app.getVersion(),
    });
  });

  autoUpdater.on('update-available', (info) => {
    pendingInfo = info;
    const payload = {
      status: 'available',
      version: info.version,
      currentVersion: app.getVersion(),
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate,
      autoEnabled: isAutoEnabled(),
    };
    emit('updater:status', payload);

    if (isAutoEnabled()) {
      downloadUpdate().catch((e) => {
        emit('updater:status', { status: 'error', message: e.message });
      });
    } else if (manualCheckPending || shouldNotifyForVersion(info.version)) {
      emit('updater:notify', { ...payload, manual: manualCheckPending });
    }
    manualCheckPending = false;
  });

  autoUpdater.on('download-progress', (progress) => {
    emit('updater:progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    emit('updater:status', {
      status: 'downloaded',
      version: info?.version || pendingInfo?.version,
      autoEnabled: isAutoEnabled(),
    });
    if (isAutoEnabled()) {
      emit('updater:notify', {
        status: 'downloaded',
        version: info?.version || pendingInfo?.version,
        autoEnabled: true,
      });
    }
  });

  autoUpdater.on('error', (err) => {
    emit('updater:status', {
      status: 'error',
      message: err?.message || String(err),
    });
  });
}

function init(send) {
  if (isDev) return { ok: false, reason: 'dev' };
  sendFn = send;
  configureUpdater();
  return { ok: true };
}

function scheduleStartupCheck(delayMs = 5000) {
  if (isDev) return;
  const cfg = getCfg();
  if (cfg.checkOnStartup === false) return;
  setTimeout(() => {
    checkForUpdates(false).catch(() => {});
  }, delayMs);
}

async function checkForUpdates(manual = false) {
  if (isDev) {
    return { ok: false, reason: 'dev', message: 'Updates disabled in dev mode' };
  }
  if (manual) manualCheckPending = true;
  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      ok: true,
      manual,
      updateInfo: result?.updateInfo || null,
      currentVersion: app.getVersion(),
    };
  } catch (e) {
    manualCheckPending = false;
    const message = e?.message || String(e);
    emit('updater:status', { status: 'error', message, manual });
    return { ok: false, error: message, manual };
  }
}

async function downloadUpdate() {
  if (isDev) return { ok: false, reason: 'dev' };
  try {
    emit('updater:status', { status: 'downloading', version: pendingInfo?.version });
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (e) {
    const message = e?.message || String(e);
    emit('updater:status', { status: 'error', message });
    return { ok: false, error: message };
  }
}

function quitAndInstall() {
  if (isDev) return { ok: false, reason: 'dev' };
  autoUpdater.quitAndInstall(false, true);
  return { ok: true };
}

function dismissChangelog(version) {
  if (!version) return getCfg();
  const cfg = getCfg();
  store.updateSettings({
    autoUpdate: { ...cfg, dismissedChangelogVersion: version },
  });
  return store.getSettings().autoUpdate;
}

function shouldShowChangelog() {
  const current = app.getVersion();
  const dismissed = getCfg().dismissedChangelogVersion;
  return dismissed !== current;
}

function dismissVersion(version) {
  if (!version) return store.getSettings().autoUpdate;
  const cfg = getCfg();
  store.updateSettings({
    autoUpdate: { ...cfg, dismissedVersion: version },
  });
  return store.getSettings().autoUpdate;
}

function setAutoUpdateEnabled(enabled) {
  const cfg = getCfg();
  store.updateSettings({
    autoUpdate: { ...cfg, enabled: !!enabled, checkOnStartup: true },
  });
  if (enabled && pendingInfo && autoUpdater.currentVersion !== pendingInfo.version) {
    downloadUpdate().catch(() => {});
  }
  return store.getSettings().autoUpdate;
}

function getStatus() {
  return {
    supported: !isDev,
    currentVersion: app.getVersion(),
    autoUpdate: getCfg(),
    pendingVersion: pendingInfo?.version || null,
    showChangelog: shouldShowChangelog(),
  };
}

module.exports = {
  init,
  scheduleStartupCheck,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
  dismissVersion,
  dismissChangelog,
  shouldShowChangelog,
  setAutoUpdateEnabled,
  getStatus,
  isDev,
};
