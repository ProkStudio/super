/**
 * Пути и имена выходных файлов.
 */

const path = require('path');
const fs = require('fs');
const { isImagePath, getOutputDirName } = require('./mediaUtils');

/** Безопасное имя папки */
function sanitizeFolderName(name) {
  return (name || 'video')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'video';
}

/**
 * @typedef {object} OutputOptions
 * @property {boolean} useCustomOutputDir
 * @property {string} customOutputDir
 * @property {boolean} subfolderPerVideo
 * @property {'unique_n'|'original_unique_n'|'prefix_n'} filenamePattern
 * @property {string} filenamePrefix
 */

const DEFAULT_OUTPUT_OPTIONS = {
  useCustomOutputDir: false,
  customOutputDir: '',
  subfolderPerVideo: false,
  filenamePattern: 'unique_n',
  filenamePrefix: 'уник',
};

/** Базовая папка вывода для одного исходника */
function resolveBaseOutputDir(inputPath, outputOptions = {}) {
  const opts = { ...DEFAULT_OUTPUT_OPTIONS, ...outputOptions };
  if (opts.useCustomOutputDir && opts.customOutputDir) {
    return path.resolve(opts.customOutputDir);
  }
  return path.join(path.dirname(path.resolve(inputPath)), getOutputDirName(inputPath));
}

/** Полный путь к выходному файлу */
function resolveOutputPath(inputPath, copyIndex, batchMode, outputOptions = {}) {
  const opts = { ...DEFAULT_OUTPUT_OPTIONS, ...outputOptions };
  let dir = resolveBaseOutputDir(inputPath, opts);

  if (opts.subfolderPerVideo) {
    dir = path.join(dir, sanitizeFolderName(path.parse(inputPath).name));
  }

  fs.mkdirSync(dir, { recursive: true });
  const filename = buildOutputFilename(inputPath, copyIndex, batchMode, opts);
  return path.join(dir, filename);
}

/** Имя выходного файла по шаблону */
function buildOutputFilename(inputPath, copyIndex, batchMode, outputOptions = {}) {
  const opts = { ...DEFAULT_OUTPUT_OPTIONS, ...outputOptions };
  const stem = path.parse(inputPath).name;
  const prefix = (opts.filenamePrefix || 'уник').trim() || 'уник';
  const isImage = isImagePath(inputPath);
  const ext = isImage
    ? (path.extname(inputPath).toLowerCase() === '.png' ? '.png' : '.jpg')
    : '.mp4';

  switch (opts.filenamePattern) {
    case 'original_unique_n':
      return `${stem}_${prefix}_${copyIndex}${ext}`;
    case 'prefix_n':
      return `${prefix}_${copyIndex}${ext}`;
    case 'unique_n':
    default:
      if (batchMode && !opts.subfolderPerVideo) {
        return `${stem}_${prefix}_${copyIndex}${ext}`;
      }
      return `${prefix}_${copyIndex}${ext}`;
  }
}

module.exports = {
  DEFAULT_OUTPUT_OPTIONS,
  sanitizeFolderName,
  resolveBaseOutputDir,
  resolveOutputPath,
  buildOutputFilename,
};
