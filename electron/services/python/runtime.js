/**
 * Разрешение Python и запуск скриптов из resources.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { getPythonSpawnEnv } = require('../bundledPython');

function platformFolder() {
  if (process.platform === 'win32') return 'win';
  if (process.platform === 'darwin') return 'mac';
  return 'linux';
}

function uniqProjectPythonRoot() {
  return path.join(__dirname, '..', '..', '..', '..', 'Uniq', 'resources', 'python');
}

/** Корень resources/python (dev или packaged) */
function getPythonRoot() {
  if (app?.isPackaged) {
    const packaged = path.join(process.resourcesPath, 'resources', 'python');
    if (fs.existsSync(packaged)) return packaged;
    return path.join(process.resourcesPath, 'python');
  }
  const dev = path.join(__dirname, '..', '..', '..', 'resources', 'python');
  if (fs.existsSync(path.join(dev, 'scripts'))) return dev;
  const fallback = uniqProjectPythonRoot();
  if (fs.existsSync(fallback)) return fallback;
  return dev;
}

function resolvePythonExe() {
  const root = getPythonRoot();
  const folder = platformFolder();

  if (process.platform === 'win32') {
    const bundled = path.join(root, 'win', 'python.exe');
    if (fs.existsSync(bundled)) return bundled;
    return 'py';
  }

  const bundledMac = path.join(root, folder, 'bin', 'python3');
  if (fs.existsSync(bundledMac)) return bundledMac;

  return process.platform === 'win32' ? 'python' : 'python3';
}

function getScriptsDir() {
  const root = getPythonRoot();
  const scripts = path.join(root, 'scripts');
  if (fs.existsSync(scripts)) return scripts;
  if (app?.isPackaged) {
    const p = path.join(process.resourcesPath, 'resources', 'python', 'scripts');
    if (fs.existsSync(p)) return p;
  }
  return scripts;
}

function getRequirementsPath() {
  const root = getPythonRoot();
  const req = path.join(root, 'requirements.txt');
  if (fs.existsSync(req)) return req;
  if (app?.isPackaged) {
    const p = path.join(process.resourcesPath, 'resources', 'python', 'requirements.txt');
    if (fs.existsSync(p)) return p;
  }
  return req;
}

function checkPythonAvailable() {
  return new Promise((resolve) => {
    const exe = resolvePythonExe();
    const args = process.platform === 'win32' && exe === 'py' ? ['-3', '--version'] : ['--version'];
    const proc = spawn(exe, args, { windowsHide: true, shell: process.platform === 'win32' });
    let out = '';
    proc.stdout?.on('data', (d) => { out += d; });
    proc.stderr?.on('data', (d) => { out += d; });
    proc.on('close', (code) => resolve(code === 0 || /Python 3/.test(out)));
    proc.on('error', () => resolve(false));
  });
}

function checkImport(...modules) {
  return new Promise((resolve) => {
    const exe = resolvePythonExe();
    const code = modules.map((m) => `import ${m}`).join(';');
    const args = process.platform === 'win32' && exe === 'py' ? ['-3', '-c', code] : ['-c', code];
    const proc = spawn(exe, args, { windowsHide: true, shell: false });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

function checkAdversarialDeps() {
  return checkImport('torch', 'torchvision', 'cv2');
}

function checkFaceDeps() {
  return checkImport('torch', 'cv2', 'gfpgan');
}

async function getPythonStatus() {
  const available = await checkPythonAvailable();
  if (!available) {
    return { available: false, adversarialDeps: false, faceDeps: false, pythonPath: null };
  }
  const [adversarialDeps, faceDeps] = await Promise.all([
    checkAdversarialDeps(),
    checkFaceDeps(),
  ]);
  return {
    available: true,
    adversarialDeps,
    faceDeps,
    pythonPath: resolvePythonExe(),
    requirementsPath: getRequirementsPath(),
  };
}

function spawnPythonScript(scriptName, scriptArgs, { onProgress, signal, extraEnv } = {}) {
  const scriptsDir = getScriptsDir();
  const scriptPath = path.join(scriptsDir, scriptName);
  const exe = resolvePythonExe();

  if (!fs.existsSync(scriptPath)) {
    return Promise.reject(new Error(`Скрипт не найден: ${scriptPath}`));
  }

  const pyArgs = process.platform === 'win32' && exe === 'py'
    ? ['-3', scriptPath, ...scriptArgs]
    : [scriptPath, ...scriptArgs];

  return new Promise((resolve, reject) => {
    const proc = spawn(exe, pyArgs, {
      windowsHide: true,
      env: getPythonSpawnEnv(extraEnv),
    });

    let stderr = '';
    proc.stdout.on('data', (data) => {
      const text = data.toString();
      for (const line of text.split('\n')) {
        const m = line.match(/^PROGRESS:(\d+)/);
        if (m && onProgress) onProgress(parseInt(m[1], 10));
      }
    });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    if (signal) {
      signal.addEventListener('abort', () => {
        try { proc.kill('SIGTERM'); } catch { /* ignore */ }
      });
    }

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Python exit ${code}`));
    });
    proc.on('error', (err) => reject(err));
  });
}

function installPythonDeps(onLog) {
  return new Promise((resolve, reject) => {
    const req = getRequirementsPath();
    if (!fs.existsSync(req)) {
      reject(new Error('requirements.txt не найден'));
      return;
    }
    const exe = resolvePythonExe();
    const args = process.platform === 'win32' && exe === 'py'
      ? ['-3', '-m', 'pip', 'install', '-r', req]
      : ['-m', 'pip', 'install', '-r', req];

    const proc = spawn(exe, args, { windowsHide: true });
    proc.stdout.on('data', (d) => onLog?.(d.toString()));
    proc.stderr.on('data', (d) => onLog?.(d.toString()));
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`pip exit ${code}`))));
    proc.on('error', reject);
  });
}

module.exports = {
  resolvePythonExe,
  getScriptsDir,
  getRequirementsPath,
  getPythonStatus,
  spawnPythonScript,
  installPythonDeps,
  checkPythonAvailable,
};
