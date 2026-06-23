const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getResourcesPath, commandExists } = require('./systemCheck');
const { getBundledPythonExe, getPythonSpawnEnv } = require('./bundledPython');

const activeJobs = new Map();

function getScriptsPath() {
  const { app } = require('electron');
  if (app?.isPackaged) return path.join(process.resourcesPath, 'scripts');
  return path.join(__dirname, '..', '..', 'scripts');
}

async function resolvePython() {
  const bundled = getBundledPythonExe();
  if (bundled) return bundled;
  if (await commandExists('python')) return 'python';
  if (await commandExists('python3')) return 'python3';
  return 'python';
}

function runScript(scriptName, config, onProgress, onLog, options = {}) {
  return new Promise(async (resolve, reject) => {
    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const scriptPath = path.join(getScriptsPath(), scriptName);
    const configPath = path.join(os.tmpdir(), `nexus-${jobId}.json`);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const python = await resolvePython();
    const scriptsPath = getScriptsPath();
    const proc = spawn(python, [scriptPath, '--config', configPath], {
      cwd: scriptsPath,
      env: getPythonSpawnEnv({ PYTHONPATH: scriptsPath, ...(options.extraEnv || {}) }),
      windowsHide: true,
    });

    activeJobs.set(jobId, proc);
    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    const MAX_STDOUT = 512 * 1024;
    let lastProgressAt = 0;

    const decode = (chunk) => (Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));

    proc.stdout.on('data', (chunk) => {
      const text = decode(chunk);
      stdoutBytes += Buffer.byteLength(text, 'utf8');
      if (stdoutBytes <= MAX_STDOUT) stdout += text;
      for (const line of text.split('\n')) {
        if (line.startsWith('UPLOAD_SESSION:')) {
          try {
            const session = JSON.parse(line.slice(15));
            onProgress?.({ type: 'uploadSession', session });
          } catch { /* ignore */ }
        } else if (line.startsWith('PROGRESS:')) {
          try {
            const payload = JSON.parse(line.slice(9));
            if (payload.type === 'repliedKeys') {
              onProgress?.(payload);
            } else {
              if (payload.message) {
                onLog?.({ text: payload.message, level: 'info' });
              }
              const now = Date.now();
              if (now - lastProgressAt >= 400 || payload.percent >= 99 || payload.percent === 0) {
                lastProgressAt = now;
                onProgress?.(payload);
              }
            }
          } catch { /* ignore */ }
        } else if (line.trim() && !line.startsWith('RESULT:')) {
          onLog?.(line.trim());
        }
      }
    });

    proc.stderr.on('data', (chunk) => {
      const text = decode(chunk);
      stderr += text;
      const line = text.trim();
      if (line) onLog?.(`[stderr] ${line}`);
    });

    proc.on('close', (code) => {
      activeJobs.delete(jobId);
      try { fs.unlinkSync(configPath); } catch { /* ignore */ }
      if (code === 0) {
        try {
          const lastLine = stdout.trim().split('\n').pop();
          if (lastLine?.startsWith('RESULT:')) {
            resolve(JSON.parse(lastLine.slice(7)));
          } else resolve({ ok: true });
        } catch {
          resolve({ ok: true });
        }
      } else {
        const errTail = stderr.trim().split('\n').slice(-3).join(' ').slice(0, 300);
        const hint = code == null
          ? 'скрипт прерван (отмена или сбой Playwright)'
          : `код выхода ${code}`;
        const detail = errTail ? ` — ${errTail}` : '';
        reject(new Error(`Скрипт остановлен: ${hint}${detail}`));
      }
    });

    proc.on('error', (err) => {
      activeJobs.delete(jobId);
      reject(err);
    });
  });
}

function cancelJob(jobId) {
  const proc = activeJobs.get(jobId);
  if (proc) {
    proc.kill('SIGTERM');
    activeJobs.delete(jobId);
    return true;
  }
  for (const [, p] of activeJobs) {
    p.kill('SIGTERM');
  }
  activeJobs.clear();
  return true;
}

module.exports = { runScript, cancelJob, getScriptsPath, resolvePython };
