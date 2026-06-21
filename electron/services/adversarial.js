/**
 * Обёртка adversarial perturbation (perturb.py).
 */

const path = require('path');
const fs = require('fs');
const { spawnPythonScript, getPythonStatus } = require('./python/runtime');
const { ffmpegPath } = require('./ffmpeg/pathResolver');

/**
 * Применяет adversarial attack к видео.
 * @returns {Promise<string>} путь к обработанному файлу (или input при пропуске)
 */
async function runAdversarial(inputPath, tmpDir, { level = 'medium', onProgress, signal }) {
  const status = await getPythonStatus();
  if (!status.available || !status.adversarialDeps) {
    return { path: inputPath, skipped: true, reason: 'Python или зависимости adversarial недоступны' };
  }

  fs.mkdirSync(tmpDir, { recursive: true });
  const outputPath = path.join(tmpDir, `adv_${path.basename(inputPath)}`);

  try {
    await spawnPythonScript('perturb.py', [
      inputPath,
      outputPath,
      '--level', level,
      '--model', 'mobilenet',
    ], { onProgress, signal, extraEnv: { FFMPEG_PATH: ffmpegPath() } });

    if (fs.existsSync(outputPath)) {
      return { path: outputPath, skipped: false };
    }
    return { path: inputPath, skipped: true, reason: 'Файл не создан' };
  } catch (err) {
    return { path: inputPath, skipped: true, reason: err.message };
  }
}

module.exports = { runAdversarial };
