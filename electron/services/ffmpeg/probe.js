/**
 * Метаданные видео и фото через ffprobe.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const { ffprobePath } = require('./pathResolver');
const { formatFileSize, formatDuration } = require('./progressParser');
const { isImagePath } = require('./mediaUtils');

async function probeVideo(filePath) {
  return probeVideoSpawn(filePath);
}

function probeVideoSpawn(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ];
    const proc = spawn(ffprobePath(), args, { windowsHide: true });
    let stdout = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error('ffprobe error'));
      else {
        try { resolve(JSON.parse(stdout)); }
        catch { reject(new Error('Не удалось разобрать ffprobe JSON')); }
      }
    });
    proc.on('error', reject);
  });
}

function evalFraction(str) {
  const [num, den] = str.split('/').map(Number);
  return den ? num / den : num;
}

/** Универсальные метаданные: видео или фото */
async function getMediaInfo(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error('Файл не найден');
  }

  const isImage = isImagePath(filePath);
  const stat = fs.statSync(filePath);
  const base = {
    path: filePath,
    name: filePath.split(/[/\\]/).pop(),
    size: stat.size,
    sizeFormatted: formatFileSize(stat.size),
    isImage,
    mediaType: isImage ? 'image' : 'video',
    mediaLabel: isImage ? 'Фото' : 'Видео',
  };

  if (isImage) {
    let width = 0;
    let height = 0;
    try {
      const data = await probeVideo(filePath);
      const stream = (data.streams || []).find(
        (s) => s.codec_type === 'video' || s.codec_type === undefined
      ) || data.streams?.[0];
      width = stream?.width || 0;
      height = stream?.height || 0;
    } catch {
      // ffprobe не сработал — минимальные данные
    }

    return {
      ...base,
      duration: 0,
      durationFormatted: '—',
      width,
      height,
      resolution: width && height ? `${width}×${height}` : '—',
      fps: 1,
      hasAudio: false,
      codec: 'image',
    };
  }

  const data = await probeVideo(filePath);
  const format = data.format || {};
  const videoStream = (data.streams || []).find((s) => s.codec_type === 'video');
  const audioStream = (data.streams || []).find((s) => s.codec_type === 'audio');

  const duration = parseFloat(format.duration || 0);
  const width = videoStream?.width || 0;
  const height = videoStream?.height || 0;
  const fps = videoStream?.r_frame_rate
    ? evalFraction(videoStream.r_frame_rate)
    : 24;
  const sampleRate = audioStream?.sample_rate
    ? parseInt(audioStream.sample_rate, 10)
    : null;

  return {
    ...base,
    duration,
    durationFormatted: formatDuration(duration),
    width,
    height,
    resolution: width && height ? `${width}×${height}` : '—',
    fps,
    sampleRate,
    hasAudio: !!audioStream,
    codec: videoStream?.codec_name || 'unknown',
  };
}

/** @deprecated используйте getMediaInfo */
const getVideoInfo = getMediaInfo;

module.exports = { probeVideo, getMediaInfo, getVideoInfo };
