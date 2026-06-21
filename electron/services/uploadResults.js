const store = require('./store');

const VIDEO_ID_RE = /(?:shorts\/|watch\?v=|youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})/;

function extractVideoId(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(VIDEO_ID_RE);
  return m ? m[1] : null;
}

function normalizeVideoUrl(url, videoId) {
  const id = videoId || extractVideoId(url);
  if (!id) return null;
  const raw = String(url || '');
  if (raw.includes('/shorts/')) return `https://www.youtube.com/shorts/${id}`;
  return `https://www.youtube.com/watch?v=${id}`;
}

function formatUploadBlockName(date = new Date()) {
  const stamp = date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `Загрузка ${stamp}`;
}

function sessionToVideoEntry(session) {
  if (!session || session.error) return null;

  const videoId = session.videoId || extractVideoId(session.url);
  const url = normalizeVideoUrl(session.url, videoId);

  if (!videoId || !url) {
    if (!session.published) return null;
    return null;
  }

  return {
    id: videoId,
    url,
    title: session.title || '—',
    thumbnail: '',
    views: 0,
    likes: 0,
    comments: 0,
    status: 'pending',
    profileLabel: '@MOSTLOGIN',
    profileNum: session.profileNum ?? null,
    profileId: session.profileId || '',
    login: session.login || '',
    uploadedAt: new Date().toISOString(),
  };
}

/** Создаёт пустой блок в «Результатах» в начале сессии загрузки. */
function createUploadResultsBlock() {
  const now = new Date();
  const block = {
    id: `block-upload-${now.getTime()}`,
    name: formatUploadBlockName(now),
    videos: [],
    createdAt: now.toISOString(),
    source: 'upload',
    manual: false,
  };

  const results = store.getResults();
  store.setResults({
    ...results,
    blocks: [...(results.blocks || []), block],
  });

  return block;
}

/** Добавляет одно видео в существующий блок (без дубликатов по id). */
function appendVideoToUploadBlock(blockId, session) {
  if (!blockId) return null;
  const entry = sessionToVideoEntry(session);
  if (!entry) return null;

  const results = store.getResults();
  const blocks = results.blocks || [];
  const idx = blocks.findIndex((b) => b.id === blockId);
  if (idx < 0) return null;

  const block = { ...blocks[idx], videos: [...(blocks[idx].videos || [])] };
  if (block.videos.some((v) => v.id === entry.id)) {
    return block;
  }

  block.videos.push(entry);
  const nextBlocks = blocks.map((b, i) => (i === idx ? block : b));
  store.setResults({ ...results, blocks: nextBlocks });
  return block;
}

/** Добавляет несколько сессий в новый или существующий блок. */
function appendResultsBlockFromUpload(sessions = [], { blockId } = {}) {
  if (blockId) {
    let block = null;
    for (const s of sessions) {
      const hit = appendVideoToUploadBlock(blockId, s);
      if (hit) block = hit;
    }
    return block;
  }

  const videos = [];
  const seen = new Set();
  for (const s of sessions) {
    const entry = sessionToVideoEntry(s);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    videos.push(entry);
  }

  if (!videos.length) return null;

  const now = new Date();
  const block = {
    id: `block-upload-${now.getTime()}`,
    name: formatUploadBlockName(now),
    videos,
    createdAt: now.toISOString(),
    source: 'upload',
    manual: false,
  };

  const results = store.getResults();
  store.setResults({
    ...results,
    blocks: [...(results.blocks || []), block],
  });

  return block;
}

module.exports = {
  createUploadResultsBlock,
  appendVideoToUploadBlock,
  appendResultsBlockFromUpload,
  extractVideoId,
  normalizeVideoUrl,
  sessionToVideoEntry,
};
