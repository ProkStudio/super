const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const store = require('./store');

let backupJob = null;

async function pruneOldBackups(folder, maxFiles = 5) {
  let entries = [];
  try {
    entries = await fs.readdir(folder);
  } catch {
    return;
  }
  const files = entries
    .filter((name) => name.startsWith('techpro-backup-') && name.endsWith('.json'))
    .sort();
  while (files.length > maxFiles) {
    const old = files.shift();
    await fs.unlink(path.join(folder, old)).catch(() => {});
  }
}

async function runAutoBackup() {
  const settings = store.getSettings();
  const cfg = settings.autoBackup || {};
  if (!cfg.enabled) return { skipped: true, reason: 'disabled' };
  if (!cfg.folder) return { skipped: true, reason: 'no_folder' };

  const data = store.exportAll();
  const stamp = new Date().toISOString().slice(0, 10);
  const filePath = path.join(cfg.folder, `techpro-backup-${stamp}.json`);
  await fs.mkdir(cfg.folder, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  await pruneOldBackups(cfg.folder, cfg.maxFiles || 5);
  store.updateSettings({
    autoBackup: { ...cfg, lastBackup: new Date().toISOString() },
  });
  return { ok: true, path: filePath };
}

function restart() {
  if (backupJob) {
    backupJob.stop();
    backupJob = null;
  }
  const cfg = store.getSettings().autoBackup || {};
  if (!cfg.enabled) return;
  const days = Math.max(1, cfg.intervalDays || 7);
  backupJob = cron.schedule(`0 9 */${days} * *`, () => {
    runAutoBackup().catch((e) => console.error('Auto-backup error:', e.message));
  });
}

module.exports = { runAutoBackup, restart };
