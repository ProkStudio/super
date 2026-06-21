/**
 * YouTube Data API v3 — ported from Checker
 */
const axios = require('axios');

const BASE_URL = 'https://www.googleapis.com/youtube/v3';

const PATTERNS = [
  /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
  /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
];

function extractVideoId(input) {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  for (const pattern of PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function parseVideoIds(text) {
  const lines = (text || '').split(/\r?\n/);
  const seen = new Set();
  const result = [];
  for (const line of lines) {
    const id = extractVideoId(line);
    if (id && !seen.has(id)) {
      seen.add(id);
      result.push({ id, originalUrl: line.trim() });
    }
  }
  return result;
}

function handleApiError(error) {
  const status = error.response?.status;
  const reason = error.response?.data?.error?.errors?.[0]?.reason;
  const message = error.response?.data?.error?.message;
  if (status === 403 && (reason === 'quotaExceeded' || message?.includes('quota'))) {
    const err = new Error('Превышена квота YouTube API');
    err.code = 'QUOTA_EXCEEDED';
    throw err;
  }
  if (status === 400 || status === 403) {
    const err = new Error('Невалидный API-ключ YouTube');
    err.code = 'INVALID_KEY';
    throw err;
  }
  throw error;
}

async function validateKey(apiKey) {
  const { data } = await axios.get(`${BASE_URL}/videos`, {
    params: { part: 'id', id: 'dQw4w9WgXcQ', key: apiKey },
    timeout: 10000,
  });
  return { valid: true, items: data.items?.length ?? 0 };
}

async function fetchVideosBatch(ids, apiKey, signal) {
  const { data } = await axios.get(`${BASE_URL}/videos`, {
    params: { part: 'statistics,snippet,contentDetails,status', id: ids.join(','), key: apiKey },
    timeout: 30000,
    signal,
  });
  return data.items || [];
}

function mapVideoItem(item) {
  const stats = item.statistics || {};
  const snippet = item.snippet || {};
  const contentDetails = item.contentDetails || {};
  const rating = contentDetails.contentRating || {};
  const uploadStatus = item.status?.uploadStatus;

  let videoStatus = 'ok';
  if (uploadStatus === 'rejected' || uploadStatus === 'failed') videoStatus = 'ban';
  if (!item.statistics) videoStatus = 'unavailable';

  return {
    id: item.id,
    title: snippet.title || 'Без названия',
    description: snippet.description || '',
    thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
    views: parseInt(stats.viewCount || '0', 10),
    likes: parseInt(stats.likeCount || '0', 10),
    comments: parseInt(stats.commentCount || '0', 10),
    publishedAt: snippet.publishedAt || null,
    duration: contentDetails.duration || null,
    ageRestricted: rating.ytRating === 'ytAgeRestricted',
    url: `https://www.youtube.com/shorts/${item.id}`,
    status: videoStatus,
  };
}

async function runChecker(linksText, apiKey, onProgress, signal) {
  const entries = parseVideoIds(linksText);
  const total = entries.length;
  const results = [];
  const BATCH_SIZE = 50;

  if (total === 0) return { results: [], summary: emptySummary() };

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    if (signal?.aborted) break;
    const batch = entries.slice(i, i + BATCH_SIZE);
    const ids = batch.map((e) => e.id);
    try {
      const items = await fetchVideosBatch(ids, apiKey, signal);
      const itemMap = new Map(items.map((item) => [item.id, item]));
      for (const entry of batch) {
        const item = itemMap.get(entry.id);
        if (item) results.push(mapVideoItem(item));
        else {
          results.push({
            id: entry.id,
            title: 'Недоступно',
            thumbnail: '',
            views: 0, likes: 0, comments: 0,
            url: entry.originalUrl || `https://www.youtube.com/shorts/${entry.id}`,
            status: 'unavailable',
          });
        }
      }
    } catch (error) {
      if (signal?.aborted || error.name === 'CanceledError') break;
      handleApiError(error);
    }
    onProgress?.({ current: Math.min(i + BATCH_SIZE, total), total });
  }
  return { results, summary: computeSummary(results) };
}

function emptySummary() {
  return { videoCount: 0, totalViews: 0, totalLikes: 0, totalComments: 0 };
}

function computeSummary(results) {
  const ok = results.filter((r) => r.status === 'ok');
  return {
    videoCount: results.length,
    checkedCount: ok.length,
    unavailableCount: results.filter((r) => r.status === 'unavailable').length,
    banCount: results.filter((r) => r.status === 'ban').length,
    totalViews: ok.reduce((s, r) => s + r.views, 0),
    totalLikes: ok.reduce((s, r) => s + r.likes, 0),
    totalComments: ok.reduce((s, r) => s + r.comments, 0),
    zeroViewsCount: ok.filter((r) => !r.views).length,
    ageRestrictedCount: ok.filter((r) => r.ageRestricted).length,
  };
}

async function runCheckerOnIds(videoIds, apiKey, onProgress, signal) {
  const linksText = videoIds.map((id) => `https://youtube.com/shorts/${id}`).join('\n');
  return runChecker(linksText, apiKey, onProgress, signal);
}

module.exports = {
  validateKey,
  runChecker,
  runCheckerOnIds,
  parseVideoIds,
  extractVideoId,
  mapVideoItem,
  computeSummary,
  handleApiError,
};
