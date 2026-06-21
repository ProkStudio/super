/**
 * Обёртка GFPGAN face enhance (face_enhance.py).
 */

const path = require('path');
const fs = require('fs');
const { spawnPythonScript, getPythonStatus } = require('./python/runtime');
const { ffmpegPath } = require('./ffmpeg/pathResolver');

/**
 * Улучшение лиц в видео.
 * @returns {Promise<{path: string, skipped: boolean, reason?: string}>}
 */
async function runFaceEnhance(inputPath, tmpDir, { onProgress, signal }) {
  const status = await getPythonStatus();
  if (!status.available || !status.faceDeps) {
    return { path: inputPath, skipped: true, reason: 'Python или GFPGAN недоступны' };
  }

  fs.mkdirSync(tmpDir, { recursive: true });
  const outputPath = path.join(tmpDir, `face_${path.basename(inputPath)}`);

  try {
    await spawnPythonScript('face_enhance.py', [inputPath, outputPath], {
      onProgress,
      signal,
      extraEnv: { FFMPEG_PATH: ffmpegPath() },
    });

    if (fs.existsSync(outputPath)) {
      return { path: outputPath, skipped: false };
    }
    return { path: inputPath, skipped: true, reason: 'Файл не создан' };
  } catch (err) {
    return { path: inputPath, skipped: true, reason: err.message };
  }
}

module.exports = { runFaceEnhance };
