const PATTERNS = [
  /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
  /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
];

export function extractVideoId(input) {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  for (const pattern of PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function parseLinkLine(line) {
  const trimmed = (line || '').trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/https?:\/\/[^\s]+/);
  const url = urlMatch?.[0] || trimmed;
  const id = extractVideoId(url);
  if (!id) return null;

  const rest = trimmed.replace(url, '').trim();
  const tagMatch = rest.match(/@(\S+?)(?:\s+(\d+))?$/);
  const profileLabel = tagMatch ? `@${tagMatch[1]}` : '';
  const profileNum = tagMatch?.[2] ? parseInt(tagMatch[2], 10) : null;

  return {
    id,
    url: url.startsWith('http') ? url : `https://youtube.com/shorts/${id}`,
    profileLabel,
    profileNum,
  };
}

export function parseLinksText(text) {
  const seen = new Set();
  const result = [];
  for (const line of (text || '').split(/\r?\n/)) {
    const entry = parseLinkLine(line);
    if (entry && !seen.has(entry.id)) {
      seen.add(entry.id);
      result.push(entry);
    }
  }
  return result;
}

export function videosFromLinks(text) {
  return parseLinksText(text).map((entry) => ({
    id: entry.id,
    url: entry.url,
    title: '—',
    thumbnail: '',
    views: 0,
    likes: 0,
    comments: 0,
    status: 'pending',
    profileLabel: entry.profileLabel,
    profileNum: entry.profileNum,
  }));
}

export function mergeCheckerResults(newResults, oldVideos = []) {
  const oldMap = new Map(oldVideos.map((v) => [v.id, v]));
  return newResults.map((v) => {
    const prev = oldMap.get(v.id);
    return {
      ...v,
      profileLabel: prev?.profileLabel || v.profileLabel || '',
      profileNum: prev?.profileNum ?? v.profileNum ?? null,
    };
  });
}
