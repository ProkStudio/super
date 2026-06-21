export function computeBlockStats(videos = []) {
  const active = videos.filter((v) => v.status === 'ok');
  const unavailable = videos.filter((v) => v.status === 'unavailable');
  const banned = videos.filter((v) => v.status === 'ban');

  return {
    totalLinks: videos.length,
    checked: active.length,
    unavailable: unavailable.length,
    banned: banned.length,
    totalViews: active.reduce((s, v) => s + (v.views || 0), 0),
    totalLikes: active.reduce((s, v) => s + (v.likes || 0), 0),
    totalComments: active.reduce((s, v) => s + (v.comments || 0), 0),
    zeroViews: active.filter((v) => !v.views).length,
    ageRestricted: active.filter((v) => v.ageRestricted).length,
  };
}

export function groupVideos(videos = []) {
  return {
    active: videos.filter((v) => v.status === 'ok'),
    unavailable: videos.filter((v) => v.status === 'unavailable'),
    banned: videos.filter((v) => v.status === 'ban'),
    pending: videos.filter((v) => v.status === 'pending' || !v.status),
  };
}
