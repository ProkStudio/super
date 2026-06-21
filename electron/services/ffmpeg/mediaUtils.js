/**
 * Типы медиа: видео и фото.
 */
const path = require('path');

const VIDEO_EXT = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v', '.ts', '.mts',
]);

const IMAGE_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tif', '.tiff', '.heic', '.heif',
]);

const VIDEO_EXT_REGEX = /\.(mp4|mkv|avi|mov|webm|flv|wmv|m4v|ts|mts)$/i;
const IMAGE_EXT_REGEX = /\.(jpe?g|png|webp|bmp|gif|tiff?|heic|heif)$/i;
const MEDIA_EXT_REGEX = /\.(mp4|mkv|avi|mov|webm|flv|wmv|m4v|ts|mts|jpe?g|png|webp|bmp|gif|tiff?|heic|heif)$/i;

function getExt(filePath) {
  return path.extname(filePath).toLowerCase();
}

function isImagePath(filePath) {
  return IMAGE_EXT.has(getExt(filePath));
}

function isVideoPath(filePath) {
  return VIDEO_EXT.has(getExt(filePath));
}

function isMediaPath(filePath) {
  return isImagePath(filePath) || isVideoPath(filePath);
}

/** Папка вывода рядом с исходником */
function getOutputDirName(filePath) {
  return isImagePath(filePath) ? 'Uniqued_Фото' : 'Uniqued_Видео';
}

/** Расширение выходного файла */
function getOutputExt(inputPath, copyIndex, batchMode) {
  const ext = getExt(inputPath);
  const stem = path.parse(inputPath).name;
  if (isImagePath(inputPath)) {
    const outExt = ext === '.png' ? '.png' : '.jpg';
    if (batchMode) return `${stem}_уник_${copyIndex}${outExt}`;
    return `уник_${copyIndex}${outExt}`;
  }
  if (batchMode) return `${stem}_уник_${copyIndex}.mp4`;
  return `уник_${copyIndex}.mp4`;
}

module.exports = {
  VIDEO_EXT_REGEX,
  IMAGE_EXT_REGEX,
  MEDIA_EXT_REGEX,
  isImagePath,
  isVideoPath,
  isMediaPath,
  getOutputDirName,
  getOutputExt,
};
