/** Blocks created via Results → Create block are excluded from analytics. */
export function isBlockEligibleForAnalytics(block) {
  if (!block) return false;
  return block.manual !== true && block.source !== 'manual';
}

export function getEligibleBlocks(blocks = []) {
  return blocks.filter(isBlockEligibleForAnalytics);
}

export function collectVideos(blocks = []) {
  const seen = new Set();
  const videos = [];
  for (const block of getEligibleBlocks(blocks)) {
    for (const v of block.videos || []) {
      if (!v?.id || seen.has(v.id)) continue;
      seen.add(v.id);
      videos.push({
        ...v,
        blockId: block.id,
        blockName: block.name,
        blockCreatedAt: block.createdAt,
      });
    }
  }
  return videos;
}

function dayKey(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function eachDayInRange(start, end) {
  const days = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (cur <= last) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function computeAnalytics(blocks = [], daysRange = 30) {
  const eligible = getEligibleBlocks(blocks);
  const videos = collectVideos(blocks);
  const active = videos.filter((v) => v.status === 'ok');
  const banned = videos.filter((v) => v.status === 'ban' || v.status === 'unavailable');

  const profileSet = new Set();
  for (const v of videos) {
    if (v.profileLabel) profileSet.add(v.profileLabel);
    else if (v.profileNum != null) profileSet.add(String(v.profileNum));
  }

  const totals = {
    videoCount: videos.length,
    activeCount: active.length,
    totalViews: active.reduce((s, v) => s + (v.views || 0), 0),
    totalLikes: active.reduce((s, v) => s + (v.likes || 0), 0),
    totalComments: active.reduce((s, v) => s + (v.comments || 0), 0),
    profileCount: profileSet.size,
    sessionCount: eligible.length,
    bannedCount: banned.length,
  };

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysRange + 1);
  start.setHours(0, 0, 0, 0);

  const videosByDay = {};
  const viewsAddedByDay = {};

  for (const block of eligible) {
    const key = dayKey(block.createdAt);
    if (!key) continue;
    const count = (block.videos || []).length;
    videosByDay[key] = (videosByDay[key] || 0) + count;
  }

  for (const v of active) {
    const key = dayKey(v.publishedAt || v.blockCreatedAt);
    if (!key) continue;
    viewsAddedByDay[key] = (viewsAddedByDay[key] || 0) + (v.views || 0);
  }

  const dayLabels = eachDayInRange(start, end);
  let cumulative = 0;
  const viewsSeries = dayLabels.map((day) => {
    cumulative += viewsAddedByDay[day] || 0;
    return { day, value: cumulative };
  });

  const videosSeries = dayLabels.map((day) => ({
    day,
    value: videosByDay[day] || 0,
  }));

  const topVideos = [...active]
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 10)
    .map((v) => ({
      id: v.id,
      title: v.title,
      thumbnail: v.thumbnail,
      views: v.views || 0,
      likes: v.likes || 0,
      comments: v.comments || 0,
      url: v.url,
      profileLabel: v.profileLabel,
      profileNum: v.profileNum,
      status: v.status,
    }));

  return {
    totals,
    viewsSeries,
    videosSeries,
    topVideos,
    computedAt: new Date().toISOString(),
    daysRange,
  };
}
