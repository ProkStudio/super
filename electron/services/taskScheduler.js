const cron = require('node-cron');
const store = require('./store');
const youtube = require('./youtube');
const telegram = require('./telegram');
const { checkScheduledTasks } = require('./taskRunner');
const { applyCheckerResultsToBlocks } = require('./resultsMerge');

let autoCheckerJob = null;
let cleanupJob = null;
let scheduledTasksJob = null;

function cleanupOldEntries() {
  const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000;
  const tasks = store.getTasks();
  tasks.archive = (tasks.archive || []).filter((t) => new Date(t.completedAt).getTime() > twoDaysAgo);
  store.setTasks(tasks);

  const results = store.getResults();
  results.trash = (results.trash || []).filter((b) => new Date(b.deletedAt).getTime() > twoDaysAgo);
  store.setResults(results);
}

async function runAutoChecker(sendProgress) {
  const settings = store.getSettings();
  if (!settings.autoChecker?.enabled) return { skipped: true };

  const apiKey = store.getSecret('youtubeKey');
  if (!apiKey) return { skipped: true, reason: 'no_youtube_key' };

  const data = store.getResults();
  let targetBlocks = data.blocks || [];
  if (settings.autoChecker.blockScope === 'last') {
    targetBlocks = targetBlocks.slice(-1);
  }

  const videoIds = targetBlocks.flatMap((b) => (b.videos || []).map((v) => v.id)).filter(Boolean);
  if (!videoIds.length) return { skipped: true, reason: 'no_videos' };

  try {
    const { results } = await youtube.runCheckerOnIds(videoIds, apiKey, (p) => {
      if (typeof sendProgress === 'function') sendProgress('checker:progress', p);
    });
    const updatedBlocks = applyCheckerResultsToBlocks(
      data.blocks,
      results,
      { targetBlockIds: targetBlocks.map((b) => b.id) },
    );
    store.setResults({ ...data, blocks: updatedBlocks });
    if (typeof sendProgress === 'function') {
      sendProgress('results:updated', { source: 'autoChecker' });
    }

    const bans = results.filter((r) => r.status === 'ban' || r.status === 'unavailable');

    if (settings.autoChecker.telegramNotify) {
      if (!settings.autoChecker.notifyBansOnly || bans.length) {
        await telegram.sendMessage(
          `🔍 Авто-чекер: проверено ${results.length} видео. Бан/недоступно: ${bans.length}`
        );
      }
    }

    store.updateSettings({ autoChecker: { ...settings.autoChecker, lastCheck: new Date().toISOString() } });
    return { ok: true, checked: results.length, bans: bans.length };
  } catch (error) {
    console.error('Auto-checker error:', error.message);
    return { ok: false, error: error.message };
  }
}

function startScheduler(send) {
  cleanupJob = cron.schedule('0 * * * *', cleanupOldEntries);
  scheduledTasksJob = cron.schedule('* * * * *', () => checkScheduledTasks(send));

  const settings = store.getSettings();
  if (settings.autoChecker?.enabled) {
    const hours = settings.autoChecker.intervalHours || 6;
    autoCheckerJob = cron.schedule(`0 */${hours} * * *`, () => runAutoChecker(send));
  }
}

function restartAutoChecker(send) {
  if (autoCheckerJob) autoCheckerJob.stop();
  const settings = store.getSettings();
  if (settings.autoChecker?.enabled) {
    const hours = settings.autoChecker.intervalHours || 6;
    autoCheckerJob = cron.schedule(`0 */${hours} * * *`, () => runAutoChecker(send));
  }
}

module.exports = { startScheduler, restartAutoChecker, runAutoChecker, cleanupOldEntries };
