/**
 * Безопасные лимиты параллелизма — видео-кодирование не масштабируется как CPU-задачи.
 */

const os = require('os');

/** Объём RAM в ГБ */
function getMemGB() {
  return os.totalmem() / (1024 ** 3);
}

/**
 * Сколько копий можно обрабатывать одновременно.
 * @param {object} opts
 * @param {number} opts.totalJobs
 * @param {boolean} opts.adversarial
 * @param {boolean} opts.faceEnhance
 * @param {boolean} opts.maxMode
 */
function computeMaxParallel(opts) {
  const { totalJobs, adversarial, faceEnhance, maxMode } = opts;
  const memGB = getMemGB();
  const cpus = os.cpus().length || 4;

  // GFPGAN / PyTorch — одна задача, иначе ноут «умирает»
  if (faceEnhance) {
    return 1;
  }

  // Adversarial — тоже PyTorch покадрово
  if (adversarial) {
    return memGB >= 16 ? Math.min(2, totalJobs) : 1;
  }

  // Только FFmpeg: лимит по RAM (каждая копия ≈ 0.5–2 ГБ пик)
  let max = 1;
  if (memGB >= 6) max = 2;
  if (memGB >= 16 && !maxMode) max = 3;
  if (memGB >= 32 && !maxMode) max = 4;

  if (maxMode) max = Math.max(1, max - 1);

  // Большие пакеты — ещё меньше параллелизма, чтобы система оставалась отзывчивой
  if (totalJobs >= 10) max = Math.max(1, max - 1);
  if (totalJobs >= 20) max = Math.max(1, max - 1);

  // Не больше четверти ядер — у каждого ffmpeg свой пул потоков
  max = Math.min(max, Math.max(1, Math.ceil(cpus / 4)));

  return Math.min(Math.max(1, max), totalJobs);
}

/** Потоки FFmpeg на одну задачу */
function computeFfmpegThreads(maxParallel) {
  const cpus = os.cpus().length || 4;
  return Math.max(1, Math.floor(cpus / maxParallel));
}

/** Краткое описание для лога */
function describeConcurrency(maxParallel, ffmpegThreads) {
  const memGB = getMemGB().toFixed(0);
  return `${maxParallel} задач параллельно, ${ffmpegThreads} поток(ов) FFmpeg/задачу, RAM ~${memGB} ГБ`;
}

module.exports = {
  computeMaxParallel,
  computeFfmpegThreads,
  describeConcurrency,
  getMemGB,
};
