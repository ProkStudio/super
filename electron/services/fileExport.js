const { dialog, clipboard } = require('electron');
const fs = require('fs').promises;

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'jfif', 'heic', 'heif'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'flv', 'wmv', 'm4v'];
const IMAGE_FILTERS = [
  { name: 'Изображения', extensions: IMAGE_EXTENSIONS },
  { name: 'Все файлы', extensions: ['*'] },
];
const VIDEO_FILTERS = [
  { name: 'Видео', extensions: VIDEO_EXTENSIONS },
  { name: 'Все файлы', extensions: ['*'] },
];

async function openFolder(mainWindow, options = {}) {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options.title || 'Выберите папку',
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
}

async function openImages(mainWindow, options = {}) {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options.title || 'Выберите фото',
    filters: IMAGE_FILTERS,
    properties: options.multiple === false ? ['openFile'] : ['openFile', 'multiSelections'],
  });
  if (result.canceled || !result.filePaths.length) return [];
  return result.filePaths;
}

async function openVideos(mainWindow, options = {}) {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options.title || 'Выберите видео',
    filters: VIDEO_FILTERS,
    properties: options.multiple === false ? ['openFile'] : ['openFile', 'multiSelections'],
  });
  if (result.canceled || !result.filePaths.length) return [];
  return result.filePaths;
}

async function openFile(mainWindow, filters) {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [{ name: 'All', extensions: ['*'] }],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
}

async function importTxt(mainWindow) {
  const filePath = await openFile(mainWindow, [{ name: 'Text', extensions: ['txt'] }]);
  if (!filePath) return null;
  return fs.readFile(filePath, 'utf8');
}

async function importProxies(mainWindow) {
  return importTxt(mainWindow);
}

function copyToClipboard(text) {
  clipboard.writeText(text);
  return { ok: true };
}

module.exports = {
  openFolder,
  openImages,
  openVideos,
  openFile,
  importTxt,
  importProxies,
  copyToClipboard,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
};
