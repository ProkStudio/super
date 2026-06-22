/** Shared profile / folder helpers — keep folder id comparisons consistent. */

export function normalizeFolderId(id) {
  if (id == null || id === '') return null;
  return String(id);
}

export function getProfileFolderId(profile) {
  if (!profile) return null;
  return normalizeFolderId(
    profile.profileFolder?.id
    ?? profile.folderId
    ?? profile.folder_id,
  );
}

export function getProfileName(profile) {
  return profile.title || profile.name || profile.channelName || `#${String(profile.id || '').slice(0, 8)}`;
}

export function countProfilesByFolder(profiles) {
  const counts = new Map();
  for (const p of profiles || []) {
    const fid = getProfileFolderId(p);
    if (fid) counts.set(fid, (counts.get(fid) || 0) + 1);
  }
  return counts;
}

export function profileInFolders(profile, folderIds) {
  if (!folderIds?.length) return true;
  const fid = getProfileFolderId(profile);
  const set = new Set(folderIds.map(normalizeFolderId).filter(Boolean));
  return fid != null && set.has(fid);
}
