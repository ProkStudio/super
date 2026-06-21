/**
 * Процессор: параллельная очередь копий, пакетная обработка, spawn ffmpeg + Python.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { ffmpegPath } = require('./pathResolver');
const { getMediaInfo } = require('./probe');
const { parseProgressLine } = require('./progressParser');
const { buildEffectivePreset } = require('./presets');
const { buildFilterPlan, buildFfmpegArgs, stripWatermark, stripMovingOverlay } = require('./filterBuilder');
const { getOutputDirName, getOutputExt } = require('./mediaUtils');
const { resolveOutputPath, resolveBaseOutputDir } = require('./outputPaths');
const { computeMaxParallel, computeFfmpegThreads, describeConcurrency } = require('./concurrency');
const { runAdversarial } = require('../adversarial');
const { runFaceEnhance } = require('../faceEnhance');

/** Веса этапов прогресса (сумма = 1) */
const STAGE_WEIGHT = {
  adversarial: 0.20,
  face: 0.35,
  ffmpeg: 0.40,
  remux: 0.05,
};

class ProcessingManager {
  constructor() {
    this.running = false;
    this.cancelled = false;
    this.activeJobs = new Map();
    this.queue = [];
    this.jobProgress = {};
    this.totalJobs = 0;
    this.completedJobs = 0;
    this.successCount = 0;
    this.totalVideos = 1;
    this.outputDirs = [];
    this.callbacks = {};
    this.maxParallel = 1;
    this.ffmpegThreads = 1;
    this.inFlightJobs = new Set();
    this.jobAbortControllers = new Map();
    this._progressFlushTimer = null;
    this._pendingProgress = false;
    this._cancelForceTimer = null;
    this.processOpts = {};
  }

  on(event, cb) {
    this.callbacks[event] = cb;
  }

  emit(event, ...args) {
    if (this.callbacks[event]) this.callbacks[event](...args);
  }

  _outputName(inputPath, copyIndex, batchMode) {
    return getOutputExt(inputPath, copyIndex, batchMode);
  }

  _resolveOutputPath(inputPath, copyIndex) {
    return resolveOutputPath(
      inputPath,
      copyIndex,
      this.batchMode,
      this.outputOptions
    );
  }

  /** Запуск обработки */
  async start(opts) {
    if (this.running) return { ok: false, error: 'Уже выполняется' };

    const {
      inputPaths,
      inputPath,
      numCopies,
      maxMode,
      batchMode = false,
      adversarial = false,
      adversarialLevel = 'medium',
      faceEnhance = false,
      manualMode = false,
      customPreset = null,
      featureOverrides = null,
      outputOptions = null,
    } = opts;

    const paths = inputPaths?.length
      ? inputPaths
      : inputPath
        ? [inputPath]
        : [];

    if (!paths.length) return { ok: false, error: 'Нет файлов для обработки' };

    this.running = true;
    this.cancelled = false;
    this.completedJobs = 0;
    this.successCount = 0;
    this.jobProgress = {};
    this.activeJobs.clear();
    this.inFlightJobs.clear();
    this.jobAbortControllers.clear();
    this._clearProgressThrottle();
    this.queue = [];
    this.processOpts = {
      adversarial,
      adversarialLevel,
      faceEnhance,
      manualMode,
      customPreset,
      featureOverrides,
      maxMode,
    };
    this.outputOptions = outputOptions || {};
    this.preset = buildEffectivePreset({
      maxMode,
      manualMode,
      customPreset,
      featureOverrides,
    });
    this.batchMode = batchMode || paths.length > 1;
    this.numCopies = numCopies;

    const metas = new Map();
    for (const p of paths) {
      try {
        const meta = await getMediaInfo(p);
        metas.set(p, meta);
        const info = meta.isImage
          ? `${meta.mediaLabel}: ${meta.resolution}`
          : `${meta.resolution}, ${meta.durationFormatted}`;
        this.emit('log', `✓ ${meta.name} (${info})`, 'info');
      } catch (e) {
        this.emit('log', `✗ ${path.basename(p)}: ${e.message}`, 'error');
      }
    }

    const validPaths = paths.filter((p) => metas.has(p));
    if (!validPaths.length) {
      this.running = false;
      this.emit('stopped');
      return { ok: false, error: 'Не удалось прочитать ни одного файла' };
    }

    this.totalVideos = validPaths.length;
    this.outputDirs = [];

    for (let vi = 0; vi < validPaths.length; vi++) {
      const input = validPaths[vi];
      const outputPathSample = this._resolveOutputPath(input, 1);
      const outputDir = path.dirname(outputPathSample);
      if (!this.outputDirs.includes(outputDir)) this.outputDirs.push(outputDir);

      const baseDir = resolveBaseOutputDir(input, this.outputOptions);
      if (!this.outputDirs.includes(baseDir)) this.outputDirs.push(baseDir);

      for (let ci = 1; ci <= numCopies; ci++) {
        const jobId = `${vi + 1}-${ci}`;
        this.queue.push({
          jobId,
          videoIndex: vi + 1,
          copyIndex: ci,
          inputPath: input,
          outputPath: this._resolveOutputPath(input, ci),
          meta: metas.get(input),
        });
        this.jobProgress[jobId] = 0;
      }
    }

    this.totalJobs = this.queue.length;
    this.maxParallel = computeMaxParallel({
      totalJobs: this.totalJobs,
      adversarial,
      faceEnhance,
      maxMode,
    });
    this.ffmpegThreads = computeFfmpegThreads(this.maxParallel);

    if (this.totalVideos > 1) {
      this.emit('log', `Пакет: ${this.totalVideos} файлов × ${numCopies} копий = ${this.totalJobs} задач`, 'info');
    }
    this.emit('log', `Очередь: ${describeConcurrency(this.maxParallel, this.ffmpegThreads)}`, 'info');
    if (adversarial) this.emit('log', 'Adversarial обход: включён', 'info');
    if (faceEnhance) this.emit('log', 'Face Enhance: включён (может занять много времени)', 'info');
    this.emit('log', `Папки вывода: ${this.outputDirs.join('; ')}`, 'info');
    this.emit('started');

    this._spawnWorkers();
    return { ok: true, outputDirs: this.outputDirs };
  }

  _killProcess(proc, force = true) {
    if (!proc?.pid) return;
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'], { windowsHide: true, stdio: 'ignore' });
      } else {
        proc.kill(force ? 'SIGKILL' : 'SIGTERM');
      }
    } catch { /* ignore */ }
  }

  _completeCancelIfIdle() {
    if (!this.running || !this.cancelled) return;
    if (this.inFlightJobs.size > 0 || this.activeJobs.size > 0) return;
    this.completedJobs = this.totalJobs;
    this._finish();
  }

  _scheduleCancelForceKill() {
    if (this._cancelForceTimer) clearTimeout(this._cancelForceTimer);
    this._cancelForceTimer = setTimeout(() => {
      this._cancelForceTimer = null;
      if (!this.running || !this.cancelled) return;
      this.emit('log', 'Принудительная остановка процессов…', 'error');
      for (const [, proc] of this.activeJobs) {
        this._killProcess(proc, true);
      }
      this.activeJobs.clear();
      this.inFlightJobs.clear();
      this.completedJobs = this.totalJobs;
      this._finish();
    }, 5000);
  }

  _spawnWorkers() {
    while (this.inFlightJobs.size < this.maxParallel && this.queue.length > 0 && !this.cancelled) {
      const job = this.queue.shift();
      this.inFlightJobs.add(job.jobId);
      this._processJob(job).catch((err) => {
        this.inFlightJobs.delete(job.jobId);
        this.jobAbortControllers.delete(job.jobId);
        this.completedJobs++;
        this.emit('log', `Сбой задачи ${job.jobId}: ${err.message}`, 'error');
        this._scheduleProgressEmit(true);
        if (this.cancelled) {
          this._completeCancelIfIdle();
        } else {
          if (this.queue.length > 0) this._spawnWorkers();
          if (this.completedJobs >= this.totalJobs) this._finish();
        }
      });
    }
  }

  _clearProgressThrottle() {
    if (this._progressFlushTimer) {
      clearTimeout(this._progressFlushTimer);
      this._progressFlushTimer = null;
    }
    this._pendingProgress = false;
  }

  /** Throttle UI updates — stderr FFmpeg шлёт сотни строк в секунду */
  _scheduleProgressEmit(force = false) {
    if (force) {
      this._clearProgressThrottle();
      this._emitTotalProgress();
      return;
    }
    this._pendingProgress = true;
    if (this._progressFlushTimer) return;
    this._progressFlushTimer = setTimeout(() => {
      this._progressFlushTimer = null;
      if (this._pendingProgress) {
        this._pendingProgress = false;
        this._emitTotalProgress();
      }
    }, 200);
  }

  _jobLabel(job) {
    const type = job.meta?.isImage ? 'Фото' : 'Видео';
    if (this.totalVideos > 1) {
      return `${type} ${job.videoIndex}/${this.totalVideos}, копия ${job.copyIndex}`;
    }
    return `Копия ${job.copyIndex}`;
  }

  /** Расчёт весов этапов с перераспределением при пропуске */
  _getStageWeights(meta) {
    const isVideo = !meta.isImage;
    const { adversarial, faceEnhance } = this.processOpts;
    let w = { ...STAGE_WEIGHT };
    if (!isVideo || !adversarial) w.adversarial = 0;
    if (!isVideo || !faceEnhance) w.face = 0;
    if (!this.preset.enabledMethods.remux || meta.isImage) w.remux = 0;
    const sum = w.adversarial + w.face + w.ffmpeg + w.remux;
    if (sum <= 0) return { adversarial: 0, face: 0, ffmpeg: 1, remux: 0 };
    return {
      adversarial: w.adversarial / sum,
      face: w.face / sum,
      ffmpeg: w.ffmpeg / sum,
      remux: w.remux / sum,
    };
  }

  _emitJobProgress(job, percent, stage, force = false) {
    const { jobId, videoIndex, copyIndex } = job;
    const label = stage
      ? `${this._jobLabel(job)} [${stage}]`
      : this._jobLabel(job);
    this.jobProgress[jobId] = Math.min(100, Math.max(0, percent));

    const now = Date.now();
    if (force || !this._lastCopyEmit || now - this._lastCopyEmit >= 250) {
      this._lastCopyEmit = now;
      this.emit('copyProgress', {
        videoIndex,
        totalVideos: this.totalVideos,
        copyIndex,
        percent: this.jobProgress[jobId],
        label,
        stage,
      });
    }
    this._scheduleProgressEmit(force);
  }

  _cleanupTmpDir(tmpDir) {
    if (!tmpDir || !fs.existsSync(tmpDir)) return;
    try {
      const files = fs.readdirSync(tmpDir);
      for (const f of files) {
        try { fs.unlinkSync(path.join(tmpDir, f)); } catch { /* ignore */ }
      }
      fs.rmdirSync(tmpDir);
    } catch { /* ignore */ }
  }

  /** Обновить метаданные после Python-этапов (adversarial теряет аудио) */
  async _refreshWorkMeta(originalMeta, sourcePath, inputPath) {
    if (sourcePath === inputPath) return originalMeta;
    try {
      const fresh = await getMediaInfo(sourcePath);
      return {
        ...originalMeta,
        ...fresh,
        path: sourcePath,
        name: originalMeta.name,
      };
    } catch {
      return { ...originalMeta, hasAudio: false, path: sourcePath };
    }
  }

  async _processJob(job) {
    const { jobId, inputPath, outputPath, meta } = job;
    const label = this._jobLabel(job);
    const abortController = new AbortController();
    this.jobAbortControllers.set(jobId, abortController);
    const signal = abortController.signal;
    const encodeOpts = { threads: this.ffmpegThreads };

    this.emit('log', `${label}: старт (${meta.name})…`, 'progress');
    this._emitJobProgress(job, 1, 'подготовка', true);

    const weights = this._getStageWeights(meta);
    const tmpDir = path.join(os.tmpdir(), 'vu', jobId);
    const tmpFiles = [];
    let sourcePath = inputPath;
    let baseProgress = 0;

    try {
      // --- Adversarial ---
      if (!meta.isImage && this.processOpts.adversarial && !this.cancelled) {
        this.emit('log', `${label}: adversarial attack…`, 'progress');
        const result = await runAdversarial(sourcePath, tmpDir, {
          level: this.processOpts.adversarialLevel,
          signal,
          onProgress: (pct) => {
            const jobPct = baseProgress + weights.adversarial * pct;
            this._emitJobProgress(job, jobPct, 'adversarial');
          },
        });
        if (result.skipped) {
          this.emit('log', `${label}: adversarial пропущен — ${result.reason}`, 'error');
        } else if (result.path !== sourcePath) {
          tmpFiles.push(result.path);
          sourcePath = result.path;
        }
        baseProgress += weights.adversarial * 100;
      }

      // --- Face enhance ---
      if (!meta.isImage && this.processOpts.faceEnhance && !this.cancelled) {
        this.emit('log', `${label}: face enhance (GFPGAN)…`, 'progress');
        const result = await runFaceEnhance(sourcePath, tmpDir, {
          signal,
          onProgress: (pct) => {
            const jobPct = baseProgress + weights.face * pct;
            this._emitJobProgress(job, jobPct, 'face');
          },
        });
        if (result.skipped) {
          this.emit('log', `${label}: face enhance пропущен — ${result.reason}`, 'error');
        } else if (result.path !== sourcePath) {
          tmpFiles.push(result.path);
          sourcePath = result.path;
        }
        baseProgress += weights.face * 100;
      }

      const workMeta = await this._refreshWorkMeta(meta, sourcePath, inputPath);
      if (workMeta.hasAudio !== meta.hasAudio) {
        this.emit('log', `${label}: аудио ${workMeta.hasAudio ? 'есть' : 'нет'} после pre-pass`, 'info');
      }

      const overlayTmpDir = path.join(tmpDir, 'overlays');
      const plan = buildFilterPlan(this.preset, workMeta, overlayTmpDir);
      this.emit('log', `${label}: методы [${plan.appliedMethods.join(', ')}]`, 'info');
      if (plan.effectDetails?.color) {
        const c = plan.effectDetails.color;
        this.emit(
          'log',
          `${label}: цвет — ярк ${c.brightness}, контр ${c.contrast}, насыщ ${c.saturation}, hue ${c.hue}°`,
          'info',
        );
      }
      if (plan.effectDetails?.audio) {
        const a = plan.effectDetails.audio;
        this.emit(
          'log',
          `${label}: аудио — pitch ${a.pitch}, EQ ${a.eqHz}Hz ${a.eqGainDb > 0 ? '+' : ''}${a.eqGainDb}dB, ${a.sourceSampleRate}→${a.sampleRate}Hz, vol ${a.volume}`,
          'info',
        );
      }

      let args = buildFfmpegArgs(sourcePath, outputPath, plan, workMeta, encodeOpts);
      const ffmpegBase = baseProgress;
      const ffmpegWeight = weights.ffmpeg * 100;

      await this._runFfmpeg(job, args, workMeta, (pct) => {
        this._emitJobProgress(job, ffmpegBase + (ffmpegWeight * pct) / 100, 'ffmpeg');
      });

      if (this.preset.enabledMethods.remux && !meta.isImage && !this.cancelled) {
        await this._remux(outputPath, jobId);
        if (!this.cancelled) {
          this._emitJobProgress(job, 100, 'remux', true);
        }
      }

      if (this.cancelled) {
        this._cleanup(outputPath);
        this.emit('log', `${label}: отменена`, 'error');
      } else {
        this.successCount++;
        this.jobProgress[jobId] = 100;
        this._emitJobProgress(job, 100, 'done', true);
        this.emit('log', `${label}: готово → ${path.basename(outputPath)}`, 'success');
        this.emit('copyDone', {
          videoIndex: job.videoIndex,
          copyIndex: job.copyIndex,
          outputPath,
          label,
        });
      }
    } catch (err) {
      if (!this.cancelled) {
        const recovered = await this._retryFfmpegWithFallbacks({
          job,
          label,
          sourcePath,
          outputPath,
          meta: await this._refreshWorkMeta(meta, sourcePath, inputPath),
          tmpDir,
          overlayTmpDir: path.join(tmpDir, 'overlays'),
          ffmpegBase: baseProgress,
          ffmpegWeight: weights.ffmpeg * 100,
          originalError: err.message,
        });
        if (!recovered) {
          this._cleanup(outputPath);
          this.emit('log', `${label}: ошибка — ${err.message}`, 'error');
          this.emit('error', err.message);
        }
      }
    } finally {
      this.jobAbortControllers.delete(jobId);
      this.inFlightJobs.delete(jobId);
      this._cleanupTmpDir(tmpDir);
      if (this.cancelled) this._completeCancelIfIdle();
    }

    this.completedJobs++;
    this._scheduleProgressEmit(true);

    if (this.cancelled) {
      this._completeCancelIfIdle();
      return;
    }

    if (this.queue.length > 0) {
      this._spawnWorkers();
    }

    if (this.completedJobs >= this.totalJobs) {
      this._finish();
    }
  }

  /** Повтор encode: без overlay, без watermark или без обоих */
  async _retryFfmpegWithFallbacks(ctx) {
    const {
      job, label, sourcePath, outputPath, meta, tmpDir, overlayTmpDir,
      ffmpegBase, ffmpegWeight, originalError,
    } = ctx;

    const overlayDir = overlayTmpDir || path.join(tmpDir, 'overlays');
    const plan = buildFilterPlan(this.preset, meta, overlayDir);
    const attempts = [];

    if (plan.appliedMethods?.includes('movingOverlay')) {
      attempts.push({
        name: 'без moving overlay',
        plan: stripMovingOverlay(plan, this.preset, meta),
      });
    }
    if (plan.hasWatermark) {
      attempts.push({
        name: 'без watermark',
        plan: stripWatermark(plan, this.preset, meta),
      });
    }
    if (plan.appliedMethods?.includes('movingOverlay') && plan.hasWatermark) {
      let p = stripMovingOverlay(plan, this.preset, meta);
      p = stripWatermark(p, this.preset, meta);
      attempts.push({ name: 'без overlay и watermark', plan: p });
    }

    if (!attempts.length) return false;

    for (const attempt of attempts) {
      try {
        this.emit('log', `${label}: повтор (${attempt.name})…`, 'progress');
        const args = buildFfmpegArgs(sourcePath, outputPath, attempt.plan, meta, {
          threads: this.ffmpegThreads,
        });
        await this._runFfmpeg(job, args, meta, (pct) => {
          this._emitJobProgress(job, ffmpegBase + (ffmpegWeight * pct) / 100, 'ffmpeg');
        });
        if (this.preset.enabledMethods.remux && !meta.isImage && !this.cancelled) {
          await this._remux(outputPath, job.jobId);
        }
        this.successCount++;
        this.jobProgress[job.jobId] = 100;
        this._emitJobProgress(job, 100, 'done', true);
        this.emit('log', `${label}: готово (${attempt.name})`, 'success');
        this.emit('copyDone', {
          videoIndex: job.videoIndex,
          copyIndex: job.copyIndex,
          outputPath,
          label,
        });
        return true;
      } catch (e) {
        this.emit('log', `${label}: ${attempt.name} — ${e.message}`, 'error');
      }
    }

    this.emit('log', `${label}: все повторы неудачны (было: ${originalError})`, 'error');
    return false;
  }

  _runFfmpeg(job, args, meta, onProgress) {
    const { jobId } = job;
    const isImage = meta.isImage;
    const durationSec = meta.duration || 1;

    return new Promise((resolve, reject) => {
      if (this.cancelled) {
        reject(new Error('Отменено'));
        return;
      }

      if (isImage) {
        onProgress?.(20);
      } else {
        onProgress?.(2);
      }

      const proc = spawn(ffmpegPath(), args, { windowsHide: true });
      this.activeJobs.set(jobId, proc);
      let stderrTail = '';

      proc.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderrTail = (stderrTail + chunk).slice(-4000);
        if (isImage) return;
        for (const line of chunk.split('\n')) {
          const pct = parseProgressLine(line, durationSec);
          if (pct !== null) onProgress?.(pct);
        }
      });

      proc.on('close', (code) => {
        this.activeJobs.delete(jobId);
        if (this.cancelled) {
          reject(new Error('Отменено'));
        } else if (code === 0) {
          if (isImage) onProgress?.(100);
          resolve();
        } else {
          const errLine = stderrTail
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l && (/error|invalid|failed|not found/i.test(l)))
            .pop();
          reject(new Error(errLine || `FFmpeg завершился с кодом ${code}`));
        }
      });

      proc.on('error', (err) => {
        this.activeJobs.delete(jobId);
        if (err.code === 'ENOENT') {
          reject(new Error('ffmpeg не найден. Windows: resources/bin/win/ · Mac: resources/bin/mac/'));
        } else {
          reject(err);
        }
      });
    });
  }

  _remux(filePath, jobId) {
    if (this.cancelled) return Promise.resolve();
    return new Promise((resolve) => {
      const tmpPath = filePath + '.remux.tmp.mp4';
      const args = [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', filePath,
        '-c', 'copy',
        '-movflags', '+faststart',
        tmpPath,
      ];
      const proc = spawn(ffmpegPath(), args, { windowsHide: true });
      if (jobId) this.activeJobs.set(jobId, proc);
      proc.on('close', (code) => {
        if (jobId) this.activeJobs.delete(jobId);
        if (code === 0 && !this.cancelled) {
          try { fs.renameSync(tmpPath, filePath); } catch { /* ignore */ }
        } else {
          try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        }
        resolve();
      });
      proc.on('error', () => {
        if (jobId) this.activeJobs.delete(jobId);
        resolve();
      });
    });
  }

  _emitTotalProgress() {
    if (this.totalJobs <= 0) return;
    const total = Object.values(this.jobProgress).reduce((a, b) => a + b, 0) / this.totalJobs;
    this.emit('totalProgress', Math.round(total));
  }

  _cleanup(filePath) {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  }

  _finish() {
    if (!this.running) return;
    this.running = false;
    this._clearProgressThrottle();
    if (this._cancelForceTimer) {
      clearTimeout(this._cancelForceTimer);
      this._cancelForceTimer = null;
    }
    if (this.cancelled) {
      this.emit('log', 'Обработка остановлена пользователем', 'error');
    } else if (this.successCount > 0) {
      const msg = this.totalVideos > 1
        ? `Готово: ${this.successCount} из ${this.totalJobs} задач (${this.totalVideos} файлов)`
        : `Готово: ${this.successCount} из ${this.totalJobs} копий`;
      this.emit('log', msg, 'success');
      this.emit('allDone', {
        outputDirs: this.outputDirs,
        outputDir: this.outputDirs[0],
        totalVideos: this.totalVideos,
        successCount: this.successCount,
      });
    } else {
      this.emit('log', 'Не удалось создать ни одной копии', 'error');
    }
    this.emit('stopped');
  }

  cancel() {
    if (!this.running) return;
    this.cancelled = true;
    this.queue = [];
    this.emit('log', 'Отмена… останавливаем активные задачи', 'error');
    for (const controller of this.jobAbortControllers.values()) {
      try { controller.abort(); } catch { /* ignore */ }
    }
    for (const [, proc] of this.activeJobs) {
      this._killProcess(proc, true);
    }
    this._completeCancelIfIdle();
    this._scheduleCancelForceKill();
  }
}

module.exports = { ProcessingManager };
