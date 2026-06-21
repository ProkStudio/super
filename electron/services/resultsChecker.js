const store = require('./store');
const youtube = require('./youtube');
const { applyCheckerResultsToBlocks } = require('./resultsMerge');

function resolveTargetBlocks(blocks, { blockId, blockIds, scope } = {}) {
  if (blockId) return blocks.filter((b) => b.id === blockId);
  if (blockIds?.length) return blocks.filter((b) => blockIds.includes(b.id));
  if (scope === 'last') return blocks.slice(-1);
  return blocks;
}

async function runCheckerOnBlocks({
  blockId,
  blockIds,
  scope = 'all',
  apiKey,
  onProgress,
  signal,
}) {
  const data = store.getResults();
  const targets = resolveTargetBlocks(data.blocks || [], { blockId, blockIds, scope });
  if (!targets.length) {
    return { ok: false, error: 'Нет блоков для проверки' };
  }

  const videoIds = targets.flatMap((b) => (b.videos || []).map((v) => v.id)).filter(Boolean);
  if (!videoIds.length) {
    return { ok: false, error: 'В выбранных блоках нет видео' };
  }

  const { results } = await youtube.runCheckerOnIds(videoIds, apiKey, onProgress, signal);
  const updatedBlocks = applyCheckerResultsToBlocks(
    data.blocks,
    results,
    { targetBlockIds: targets.map((b) => b.id) },
  );
  store.setResults({ ...data, blocks: updatedBlocks });

  return {
    ok: true,
    results,
    checked: results?.length || 0,
    blocks: targets.length,
    blockIds: targets.map((b) => b.id),
  };
}

module.exports = { runCheckerOnBlocks, resolveTargetBlocks };
