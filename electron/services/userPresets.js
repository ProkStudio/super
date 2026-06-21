/**
 * Сохранение/загрузка пользовательских пресетов настроек (JSON).
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function getPresetsDir() {
  const dir = path.join(app.getPath('userData'), 'uniqueizer-presets');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function listPresets() {
  const dir = getPresetsDir();
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.basename(f, '.json'))
    .sort((a, b) => a.localeCompare(b, 'ru'));
}

function savePreset(name, data) {
  const safe = (name || 'preset').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 60);
  const filePath = path.join(getPresetsDir(), `${safe}.json`);
  const payload = {
    version: 1,
    name: safe,
    savedAt: new Date().toISOString(),
    ...data,
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return { ok: true, name: safe, path: filePath };
}

function loadPreset(name) {
  const filePath = path.join(getPresetsDir(), `${name}.json`);
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: 'Пресет не найден' };
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return { ok: true, data };
}

function deletePreset(name) {
  const filePath = path.join(getPresetsDir(), `${name}.json`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  return { ok: true };
}

module.exports = { listPresets, savePreset, loadPreset, deletePreset };
