/**
 * TikTok module — store + automation.
 */
const store = require('./store');
const tiktokRunner = require('./tiktokRunner');

const DEFAULT_TIKTOK = {
  commentStats: [],
  repliedKeys: [],
  automation: {
    running: false,
    mode: null,
    logs: [],
  },
};

function getTiktok() {
  return { ...DEFAULT_TIKTOK, ...store.getTiktok() };
}

function setTiktok(data) {
  const merged = { ...getTiktok(), ...data };
  store.setTiktok(merged);
  return getTiktok();
}

function getCommentStats() {
  return getTiktok().commentStats || [];
}

function setCommentStats(stats) {
  return setTiktok({ commentStats: stats });
}

function getAutomationStatus() {
  const { automation } = getTiktok();
  return {
    running: !!automation?.running || tiktokRunner.isAutomationRunning(),
    mode: automation?.mode || null,
  };
}

function getAutomationLogs(limit = 200) {
  const logs = getTiktok().automation?.logs || [];
  return logs.slice(-limit);
}

async function runAutomation(opts, send) {
  const mode = opts?.mode || 'warmup';
  if (mode === 'warmup') {
    return tiktokRunner.runWarmup(opts, send);
  }
  if (mode === 'smart_comment') {
    return tiktokRunner.runSmartComment(opts, send);
  }
  return { ok: false, error: `Неизвестный режим: ${mode}` };
}

function stopAutomation() {
  return tiktokRunner.cancelAutomation();
}

module.exports = {
  DEFAULT_TIKTOK,
  getTiktok,
  setTiktok,
  getCommentStats,
  setCommentStats,
  getAutomationStatus,
  getAutomationLogs,
  runAutomation,
  stopAutomation,
};
