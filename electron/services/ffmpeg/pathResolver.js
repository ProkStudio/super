/**
 * Разрешение путей к ffmpeg/ffprobe (Windows / macOS / Linux).
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

/** Имя исполняемого файла с учётом ОС */
function binName(name) {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

/** Подпапка бинарников: win | mac | linux */
function platformBinFolder() {
  if (process.platform === 'darwin') return 'mac';
  if (process.platform === 'linux') return 'linux';
  return 'win';
}

/** macOS: отдельные ffmpeg для arm64 и x64 (универсальный .dmg) */
function resolveMacBinDir(base) {
  const archKey = process.arch === 'arm64' ? 'arm64' : 'x64';
  const archDir = path.join(base, archKey);
  if (fs.existsSync(path.join(archDir, 'ffmpeg'))) return archDir;
  if (fs.existsSync(path.join(base, 'ffmpeg'))) return base;
  return archDir;
}

/** Корень проекта (dev) или resources (prod) */
function getResourcesDir() {
  const folder = platformBinFolder();

  try {
    if (app?.isPackaged) {
      const platformPath = path.join(process.resourcesPath, 'resources', 'bin', folder);
      if (process.platform === 'darwin') {
        return resolveMacBinDir(platformPath);
      }
      if (fs.existsSync(platformPath)) return platformPath;
      return path.join(process.resourcesPath, 'resources', 'bin');
    }
  } catch {
    // electron app ещё не инициализирован
  }

  const devPlatform = path.join(__dirname, '..', '..', '..', 'resources', 'bin', folder);
  if (process.platform === 'darwin') {
    return resolveMacBinDir(devPlatform);
  }
  if (fs.existsSync(devPlatform)) return devPlatform;

  // Старый формат: resources/bin/ffmpeg.exe напрямую
  const devFlat = path.join(__dirname, '..', '..', '..', 'resources', 'bin');
  if (fs.existsSync(path.join(devFlat, binName('ffmpeg')))) return devFlat;

  return devPlatform;
}

function uniqBinDir() {
  return path.join(__dirname, '..', '..', '..', '..', 'Uniq', 'resources', 'bin', platformBinFolder());
}

/** Путь к ffmpeg */
function ffmpegPath() {
  const bundled = path.join(getResourcesDir(), binName('ffmpeg'));
  if (fs.existsSync(bundled)) return bundled;
  const uniq = path.join(uniqBinDir(), binName('ffmpeg'));
  if (fs.existsSync(uniq)) return uniq;
  return binName('ffmpeg');
}

/** Путь к ffprobe */
function ffprobePath() {
  const bundled = path.join(getResourcesDir(), binName('ffprobe'));
  if (fs.existsSync(bundled)) return bundled;
  const uniq = path.join(uniqBinDir(), binName('ffprobe'));
  if (fs.existsSync(uniq)) return uniq;
  return binName('ffprobe');
}

module.exports = { ffmpegPath, ffprobePath, getResourcesDir, platformBinFolder };
