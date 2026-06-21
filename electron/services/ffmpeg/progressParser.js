/**
 * Парсинг прогресса FFmpeg из stderr (time=HH:MM:SS.ms)
 */

/** Преобразует time=00:01:23.45 в секунды */
function parseTimeToSeconds(timeStr) {
  const match = timeStr.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d+)/);
  if (!match) return null;
  const [, h, m, s] = match;
  return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseFloat(s);
}

/** Вычисляет процент прогресса */
function calcPercent(currentSec, durationSec) {
  if (!durationSec || durationSec <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((currentSec / durationSec) * 100)));
}

/** Парсит строку stderr и возвращает процент или null */
function parseProgressLine(line, durationSec) {
  const currentSec = parseTimeToSeconds(line);
  if (currentSec === null) return null;
  return calcPercent(currentSec, durationSec);
}

/** Форматирует размер файла */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Форматирует длительность в MM:SS или HH:MM:SS */
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

module.exports = {
  parseTimeToSeconds,
  calcPercent,
  parseProgressLine,
  formatFileSize,
  formatDuration,
};
