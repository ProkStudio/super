function mergeVideoResult(oldVideo, freshResult) {
  if (!freshResult) return oldVideo;
  return {
    ...freshResult,
    url: freshResult.url || oldVideo?.url,
    profileLabel: oldVideo?.profileLabel || freshResult.profileLabel || '',
    profileNum: oldVideo?.profileNum ?? freshResult.profileNum ?? null,
  };
}

function applyCheckerResultsToBlocks(blocks, results, { targetBlockIds } = {}) {
  const resultMap = new Map((results || []).map((r) => [r.id, r]));
  if (!resultMap.size) return blocks;

  const targets = targetBlockIds?.length ? new Set(targetBlockIds) : null;
  const now = new Date().toISOString();

  return (blocks || []).map((block) => {
    if (targets && !targets.has(block.id)) return block;
    let touched = false;
    const videos = (block.videos || []).map((v) => {
      const fresh = resultMap.get(v.id);
      if (!fresh) return v;
      touched = true;
      return mergeVideoResult(v, fresh);
    });
    if (!touched) return block;
    return { ...block, videos, lastChecked: now };
  });
}

function buildResultsExportRows(blocks, { blockId, allBlocks = false } = {}) {
  const rows = [];
  for (const block of blocks || []) {
    if (!allBlocks && blockId && block.id !== blockId) continue;
    if (!allBlocks && !blockId && rows.length) break;
    for (const v of block.videos || []) {
      rows.push({
        Block: block.name || '',
        'Video ID': v.id || '',
        Title: v.title || '',
        URL: v.url || '',
        Views: v.views ?? '',
        Likes: v.likes ?? '',
        Comments: v.comments ?? '',
        Status: v.status || 'pending',
        Profile: v.profileLabel ? `${v.profileLabel}${v.profileNum != null ? ` ${v.profileNum}` : ''}` : '',
      });
    }
  }
  return rows;
}

function buildAnalyticsSnapshotRows(computed) {
  const rows = [];
  const totals = computed?.totals || {};
  rows.push({
    Metric: 'Videos',
    Value: totals.videoCount ?? 0,
  });
  rows.push({
    Metric: 'Active',
    Value: totals.activeCount ?? 0,
  });
  rows.push({
    Metric: 'Views',
    Value: totals.totalViews ?? 0,
  });
  rows.push({
    Metric: 'Likes',
    Value: totals.totalLikes ?? 0,
  });
  rows.push({
    Metric: 'Comments',
    Value: totals.totalComments ?? 0,
  });
  rows.push({
    Metric: 'Profiles',
    Value: totals.profileCount ?? 0,
  });
  rows.push({
    Metric: 'Sessions',
    Value: totals.sessionCount ?? 0,
  });
  rows.push({
    Metric: 'Banned',
    Value: totals.bannedCount ?? 0,
  });
  rows.push({
    Metric: 'Computed at',
    Value: computed?.computedAt || '',
  });
  rows.push({ Metric: '---', Value: 'Top videos' });
  for (const v of computed?.topVideos || []) {
    rows.push({
      Metric: v.title || v.id,
      Value: `views=${v.views || 0}; likes=${v.likes || 0}; comments=${v.comments || 0}`,
    });
  }
  return rows;
}

function buildTopVideosExportRows(topVideos = []) {
  return topVideos.map((v) => ({
    Title: v.title || '',
    'Video ID': v.id || '',
    URL: v.url || '',
    Views: v.views ?? 0,
    Likes: v.likes ?? 0,
    Comments: v.comments ?? 0,
    Profile: v.profileLabel ? `${v.profileLabel}${v.profileNum != null ? ` ${v.profileNum}` : ''}` : '',
    Status: v.status || 'ok',
  }));
}

module.exports = {
  mergeVideoResult,
  applyCheckerResultsToBlocks,
  buildResultsExportRows,
  buildAnalyticsSnapshotRows,
  buildTopVideosExportRows,
};
