/**
 * Bundled portable Python (resources/python/win) + Playwright browsers.
 */
const path = require('path');
const fs = require('fs');
const { getResourcesPath } = require('./systemCheck');

function getBundledPythonExe() {
  const base = getResourcesPath();
  const winPy = path.join(base, 'python', 'win', 'python.exe');
  if (fs.existsSync(winPy)) return winPy;
  const flatPy = path.join(base, 'python', 'python.exe');
  if (fs.existsSync(flatPy)) return flatPy;
  return null;
}

function getBundledPlaywrightBrowsersPath() {
  return null;
}

function getPythonSpawnEnv(extraEnv = {}) {
  return {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    PYTHONIOENCODING: 'utf-8',
    ...extraEnv,
  };
}

function hasBundledPythonStack() {
  return Boolean(getBundledPythonExe());
}

module.exports = {
  getBundledPythonExe,
  getBundledPlaywrightBrowsersPath,
  getPythonSpawnEnv,
  hasBundledPythonStack,
};
