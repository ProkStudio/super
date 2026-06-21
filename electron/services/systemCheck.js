/**
 * System status: Python, FFmpeg, Playwright.
 */
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const execFileAsync = promisify(execFile);

function getResourcesPath() {
  if (app?.isPackaged) {
    return path.join(process.resourcesPath, 'resources');
  }
  return path.join(__dirname, '..', '..', 'resources');
}

function resolveBundledBinary(name) {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const binName = `${name}${ext}`;
  const bundled = path.join(getResourcesPath(), 'bin', 'win', binName);
  if (fs.existsSync(bundled)) return bundled;
  return null;
}

async function commandExists(cmd) {
  try {
    if (process.platform === 'win32') {
      await execFileAsync('where', [cmd], { timeout: 5000 });
    } else {
      await execFileAsync('which', [cmd], { timeout: 5000 });
    }
    return true;
  } catch {
    return false;
  }
}

async function checkBinary(name, customPath) {
  if (customPath && fs.existsSync(customPath)) return true;
  const bundled = resolveBundledBinary(name);
  if (bundled) return true;
  return commandExists(name);
}

async function getSystemStatus(settings = {}) {
  const ffmpegPath = settings.ffmpegPath || resolveBundledBinary('ffmpeg');
  const bundledPy = path.join(getResourcesPath(), 'python', 'win', 'python.exe');
  let bundledPlaywright = false;
  if (fs.existsSync(bundledPy)) {
    bundledPlaywright = true;
  }
  const [ffmpeg, python, playwright] = await Promise.all([
    ffmpegPath ? (fs.existsSync(ffmpegPath) || await commandExists('ffmpeg')) : commandExists('ffmpeg'),
    fs.existsSync(bundledPy) || commandExists('python') || commandExists('python3'),
    bundledPlaywright || commandExists('playwright'),
  ]);
  return {
    ffmpeg: !!ffmpeg,
    python: !!python,
    playwright: !!playwright,
    ffmpegPath: ffmpegPath || null,
    bundledPython: fs.existsSync(bundledPy),
  };
}

module.exports = { getSystemStatus, resolveBundledBinary, getResourcesPath, commandExists };
