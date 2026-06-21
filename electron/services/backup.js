const fs = require('fs').promises;
const path = require('path');
const { dialog } = require('electron');
const store = require('./store');

async function createBackup(mainWindow) {
  const data = store.exportAll();
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Создать бэкап',
    defaultPath: `nexus-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf8');
  return result.filePath;
}

async function restoreBackup(mainWindow) {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Восстановить из бэкапа',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return { ok: false };
  const content = await fs.readFile(result.filePaths[0], 'utf8');
  const data = JSON.parse(content);
  return store.importAll(data, true);
}

async function exportCsv(mainWindow, rows, defaultName = 'export.csv') {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (result.canceled || !result.filePath) return null;
  const headers = Object.keys(rows[0] || {});
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','));
  }
  await fs.writeFile(result.filePath, '\uFEFF' + lines.join('\n'), 'utf8');
  return result.filePath;
}

module.exports = { createBackup, restoreBackup, exportCsv };
