/**
 * Background stats collection — hourly YouTube analytics refresh + optional Telegram digest
 */
const cron = require('node-cron');
const store = require('./store');
const analytics = require('./analytics');
const telegram = require('./telegram');
const { runAutoChecker } = require('./taskScheduler');

let hourlyJob = null;
let running = false;

async function collectSnapshot(sendProgress) {
  if (running) return { skipped: true };
  running = true;
  try {
    const settings = store.getSettings();
    const collector = settings.statsCollector || {};
    if (!collector.enabled) return { skipped: true, reason: 'disabled' };

    const apiKey = store.getSecret('youtubeKey');
    if (!apiKey) return { skipped: true, reason: 'no_youtube_key' };

    const daysRange = collector.daysRange || 30;
    const send = typeof sendProgress === 'function' ? sendProgress : () => {};

    const computed = await analytics.refreshAnalytics(apiKey, (p) => {
      send('stats:progress', p);
    }, daysRange);

    store.updateSettings({
      statsCollector: {
        ...collector,
        lastSnapshot: new Date().toISOString(),
      },
    });

    store.setAnalyticsCache({
      lastUpdated: new Date().toISOString(),
      totals: computed.totals,
      topVideos: computed.topVideos,
      viewsSeries: computed.viewsSeries,
      videosSeries: computed.videosSeries,
      daysRange,
      computedAt: computed.computedAt,
    });

    if (typeof sendProgress === 'function') {
      sendProgress('results:updated', { source: 'statsCollector' });
    }

    if (collector.telegramNotify && store.getSecret('telegramBotToken')) {
      const t = computed.totals || {};
      await telegram.sendMessage(
        `📊 Stats snapshot\n`
        + `Видео: ${t.videoCount || 0} | Активных: ${t.activeCount || 0}\n`
        + `Просмотры: ${t.totalViews || 0} | Бан: ${t.bannedCount || 0}`,
      ).catch(() => {});
    }

    return { ok: true, totals: computed.totals };
  } catch (error) {
    console.error('StatsCollector error:', error.message);
    return { ok: false, error: error.message };
  } finally {
    running = false;
  }
}

function start(send) {
  stop();
  const settings = store.getSettings();
  const collector = settings.statsCollector || {};
  if (!collector.enabled) return;

  const hours = Math.max(1, collector.intervalHours || 1);
  hourlyJob = cron.schedule(`0 */${hours} * * *`, async () => {
    await collectSnapshot(send);
    if (settings.autoChecker?.enabled) {
      await runAutoChecker(send);
    }
  });
}

function stop() {
  if (hourlyJob) {
    hourlyJob.stop();
    hourlyJob = null;
  }
}

function restart(send) {
  stop();
  start(send);
}

module.exports = {
  collectSnapshot,
  start,
  stop,
  restart,
};
