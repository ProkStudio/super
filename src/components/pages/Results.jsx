import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Youtube, Download, Folder, Trash2, BarChart3, RotateCcw, GitMerge,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { videosFromLinks } from '../../lib/youtubeLinks';
import CreateBlockModal from '../results/CreateBlockModal';
import BlockCard from '../results/BlockCard';
import CheckerTab from '../results/CheckerTab';
import Modal from '../ui/Modal';
import PageHeader from '../layout/PageHeader';

export default function Results() {
  const { t } = useTranslation();
  const { showToast } = useAppStore();
  const [tab, setTab] = useState('blocks');
  const [data, setData] = useState({ blocks: [], trash: [] });
  const [selectedBlock, setSelectedBlock] = useState('');
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [expanded, setExpanded] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [editBlock, setEditBlock] = useState(null);
  const [editName, setEditName] = useState('');
  const [editLinks, setEditLinks] = useState('');
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeName, setMergeName] = useState('');

  const persist = useCallback(async (next) => {
    await window.nexusAPI?.setResults(next);
    setData(next);
  }, []);

  const load = useCallback(async () => {
    const res = await window.nexusAPI?.getResults();
    setData(res || { blocks: [], trash: [] });
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const unsub = window.nexusAPI?.onResultsUpdated?.((payload) => {
      load();
      if (payload?.blockId) setSelectedBlock(payload.blockId);
    });
    return () => unsub?.();
  }, [load]);

  useEffect(() => {
    const unsub = window.nexusAPI?.onCheckerProgress?.((p) => {
      if (p?.total) setProgress(Math.round((p.current / p.total) * 100));
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (tab === 'checker' && !selectedBlock && data.blocks.length) {
      setSelectedBlock(data.blocks[0].id);
    }
  }, [tab, selectedBlock, data.blocks]);

  const totalVideos = useMemo(
    () => data.blocks.reduce((s, b) => s + (b.videos?.length || 0), 0),
    [data.blocks],
  );

  const allSelected = data.blocks.length > 0 && selectedIds.size === data.blocks.length;

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(data.blocks.map((b) => b.id)));
  };

  const createBlock = async ({ name, linksText }) => {
    const videos = videosFromLinks(linksText);
    if (!videos.length) {
      showToast(t('results.noValidLinks'), 'error');
      return;
    }
    const block = {
      id: `block-${Date.now()}`,
      name: name || `Merged: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      videos,
      createdAt: new Date().toISOString(),
      manual: true,
      source: 'manual',
    };
    await persist({ ...data, blocks: [...data.blocks, block] });
    setSelectedBlock(block.id);
    showToast(t('results.blockCreated', { count: videos.length }));
  };

  const runChecker = async (scope = 'single') => {
    if (scope === 'all') {
      if (!data.blocks.length) return;
      setChecking(true);
      setProgress(0);
      const res = await window.nexusAPI?.runCheckerBlocks?.({ scope: 'all' });
      setChecking(false);
      if (res?.ok) {
        await load();
        showToast(t('results.checkerDone'));
      } else if (res?.cancelled) {
        showToast(t('results.checkerCancelled'), 'info');
      } else {
        showToast(res?.error || t('results.checkerFailed'), 'error');
      }
      return;
    }

    const block = data.blocks.find((b) => b.id === selectedBlock);
    if (!block?.videos?.length) return;
    setChecking(true);
    setProgress(0);
    const res = await window.nexusAPI?.runCheckerBlocks?.({ blockId: selectedBlock });
    setChecking(false);
    if (res?.ok) {
      await load();
      showToast(t('results.checkerDone'));
    } else if (res?.cancelled) {
      showToast(t('results.checkerCancelled'), 'info');
    } else {
      showToast(res?.error || t('results.checkerFailed'), 'error');
    }
  };

  const cancelChecker = async () => {
    await window.nexusAPI?.cancelChecker?.();
    setChecking(false);
    setProgress(0);
  };

  const exportCsv = async (allBlocks = false) => {
    if (allBlocks) {
      const res = await window.nexusAPI?.exportResultsCsv?.({ allBlocks: true });
      if (res?.ok) showToast(t('results.exported'));
      else if (!res?.cancelled) showToast(res?.error || t('results.noVideosToExport'), 'error');
      return;
    }
    const block = data.blocks.find((b) => b.id === selectedBlock) || data.blocks[0];
    if (!block?.videos?.length) {
      showToast(t('results.noVideosToExport'), 'error');
      return;
    }
    const res = await window.nexusAPI?.exportResultsCsv?.({ blockId: block.id });
    if (res?.ok) showToast(t('results.exported'));
    else if (!res?.cancelled) showToast(t('results.noVideosToExport'), 'error');
  };

  const deleteBlock = async (blockId) => {
    const block = data.blocks.find((b) => b.id === blockId);
    if (!block) return;
    const next = {
      blocks: data.blocks.filter((b) => b.id !== blockId),
      trash: [{ ...block, deletedAt: new Date().toISOString() }, ...data.trash],
    };
    await persist(next);
    setSelectedIds((s) => { const n = new Set(s); n.delete(blockId); return n; });
    if (selectedBlock === blockId) setSelectedBlock('');
    showToast(t('results.movedToTrash'));
  };

  const deleteSelected = async () => {
    if (!selectedIds.size) return;
    let next = { ...data };
    for (const id of selectedIds) {
      const block = next.blocks.find((b) => b.id === id);
      if (block) {
        next = {
          blocks: next.blocks.filter((b) => b.id !== id),
          trash: [{ ...block, deletedAt: new Date().toISOString() }, ...next.trash],
        };
      }
    }
    await persist(next);
    setSelectedIds(new Set());
    showToast(t('results.movedToTrash'));
  };

  const duplicateBlock = async (block) => {
    const copy = {
      ...block,
      id: `block-${Date.now()}`,
      name: `${block.name} (copy)`,
      createdAt: new Date().toISOString(),
      videos: block.videos?.map((v) => ({ ...v })) || [],
    };
    await persist({ ...data, blocks: [...data.blocks, copy] });
    showToast(t('results.blockDuplicated'));
  };

  const copyBlockLinks = async (block) => {
    const text = (block.videos || []).map((v) => {
      let line = v.url || '';
      if (v.profileLabel) line += ` ${v.profileLabel}`;
      if (v.profileNum != null) line += ` ${v.profileNum}`;
      return line.trim();
    }).filter(Boolean).join('\n');
    await window.nexusAPI?.copyToClipboard?.(text);
    showToast(t('results.linksCopied'));
  };

  const saveEditBlock = async () => {
    if (!editBlock) return;
    const linksText = editLinks.trim();
    let next = {
      ...data,
      blocks: data.blocks.map((b) => (
        b.id === editBlock.id ? { ...b, name: editName.trim() || b.name } : b
      )),
    };
    if (linksText) {
      const videos = videosFromLinks(linksText);
      if (videos.length) {
        next = {
          ...next,
          blocks: next.blocks.map((b) => (
            b.id === editBlock.id ? { ...b, videos, manual: true } : b
          )),
        };
      }
    }
    await persist(next);
    setEditBlock(null);
    setEditLinks('');
    showToast(t('results.blockUpdated'));
  };

  const restoreFromTrash = async (blockId) => {
    const block = data.trash.find((b) => b.id === blockId);
    if (!block) return;
    const { deletedAt, ...rest } = block;
    await persist({
      blocks: [...data.blocks, rest],
      trash: data.trash.filter((b) => b.id !== blockId),
    });
    showToast(t('results.restored'));
  };

  const permanentDelete = async (blockId) => {
    await persist({ ...data, trash: data.trash.filter((b) => b.id !== blockId) });
    showToast(t('results.deletedPermanently'));
  };

  const openUrl = (url) => {
    if (url) window.nexusAPI?.openExternal?.(url);
  };

  const mergeSelectedBlocks = async () => {
    if (selectedIds.size < 2) {
      showToast(t('results.mergeBlocksMin'), 'error');
      return;
    }
    const blocksToMerge = data.blocks.filter((b) => selectedIds.has(b.id));
    const seen = new Set();
    const videos = [];
    blocksToMerge.forEach((block) => {
      (block.videos || []).forEach((v) => {
        const key = v.url || v.id;
        if (!key || seen.has(key)) return;
        seen.add(key);
        videos.push(v);
      });
    });
    const name = mergeName.trim() || `Merged: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
    const merged = {
      id: `block-${Date.now()}`,
      name,
      videos,
      createdAt: new Date().toISOString(),
      manual: true,
      source: 'merged',
    };
    await persist({
      blocks: [...data.blocks.filter((b) => !selectedIds.has(b.id)), merged],
      trash: data.trash,
    });
    setSelectedIds(new Set());
    setSelectedBlock(merged.id);
    setMergeOpen(false);
    setMergeName('');
    showToast(t('results.mergeBlocksDone'));
  };

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <PageHeader
        icon={Youtube}
        title={t('results.title')}
        description={`${t('results.sessions')}: ${data.blocks.length} · ${t('results.videos')}: ${totalVideos}`}
        className="shrink-0"
        actions={(
          <>
          <button
            type="button"
            onClick={() => exportCsv(false)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm hover:bg-white/5"
            style={{ borderColor: 'var(--nexus-border)' }}
          >
            <Download className="w-4 h-4" />
            {t('results.exportCsv')}
          </button>
          <button
            type="button"
            onClick={() => exportCsv(true)}
            disabled={!data.blocks.length}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm hover:bg-white/5 disabled:opacity-40"
            style={{ borderColor: 'var(--nexus-border)' }}
          >
            <Download className="w-4 h-4" />
            {t('results.exportAllCsv')}
          </button>
          </>
        )}
      />

      <div className="flex gap-2 shrink-0">
        {[
          { id: 'blocks', icon: Folder },
          { id: 'checker', icon: BarChart3 },
          { id: 'trash', icon: Trash2 },
        ].map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm border transition ${
              tab === id
                ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                : 'border-transparent text-nexus-dim hover:bg-white/5'
            }`}
          >
            <Icon className="w-4 h-4" />
            {t(`results.${id}`)}
            {id === 'trash' && data.trash.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10">{data.trash.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'blocks' && (
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <label className="flex items-center gap-2 text-xs uppercase tracking-wide cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
            {t('results.selectAll')}
          </label>
          {selectedIds.size > 0 && (
            <>
              {selectedIds.size >= 2 && (
                <button
                  type="button"
                  onClick={() => setMergeOpen(true)}
                  className="flex items-center gap-1 text-xs text-primary hover:opacity-80"
                >
                  <GitMerge className="w-3.5 h-3.5" />
                  {t('results.mergeBlocks')} ({selectedIds.size})
                </button>
              )}
              <button
                type="button"
                onClick={deleteSelected}
                className="text-xs text-red-400 hover:text-red-300"
              >
                {t('results.deleteSelected', { count: selectedIds.size })}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white"
            style={{ background: 'var(--nexus-accent)' }}
          >
            + {t('results.createBlock')}
          </button>
        </div>
      )}

      {tab === 'checker' ? (
        <CheckerTab
          blocks={data.blocks}
          selectedBlockId={selectedBlock}
          onSelectBlock={setSelectedBlock}
          onRunChecker={() => runChecker('single')}
          onRunAllChecker={() => runChecker('all')}
          onCancelChecker={cancelChecker}
          checking={checking}
          progress={progress}
          onOpenUrl={openUrl}
        />
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 min-h-0">
          {tab === 'blocks' && data.blocks.length === 0 && (
            <p className="text-center text-nexus-dim py-16">{t('results.emptyBlocks')}</p>
          )}
          {tab === 'blocks' && data.blocks.map((block) => (
            <BlockCard
              key={block.id}
              block={block}
              expanded={!!expanded[block.id]}
              selected={selectedIds.has(block.id)}
              onToggleExpand={() => setExpanded((e) => ({ ...e, [block.id]: !e[block.id] }))}
              onToggleSelect={() => setSelectedIds((s) => {
                const n = new Set(s);
                if (n.has(block.id)) n.delete(block.id);
                else n.add(block.id);
                return n;
              })}
              onEdit={() => {
                setEditBlock(block);
                setEditName(block.name);
                setEditLinks((block.videos || []).map((v) => v.url).filter(Boolean).join('\n'));
              }}
              onCopyLinks={() => copyBlockLinks(block)}
              onDuplicate={() => duplicateBlock(block)}
              onDelete={() => deleteBlock(block.id)}
              onOpenUrl={openUrl}
            />
          ))}

          {tab === 'trash' && data.trash.length === 0 && (
            <p className="text-center text-nexus-dim py-16">{t('results.emptyTrash')}</p>
          )}
          {tab === 'trash' && data.trash.map((block) => (
            <div key={block.id} className="nexus-card p-4 flex items-center gap-3">
              <Folder className="w-4 h-4 text-nexus-dim" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{block.name}</div>
                <div className="text-xs text-nexus-dim">
                  {t('results.videoCount', { count: block.videos?.length || 0 })}
                  {block.deletedAt && ` · ${new Date(block.deletedAt).toLocaleString()}`}
                </div>
              </div>
              <button type="button" onClick={() => restoreFromTrash(block.id)} className="p-2 rounded hover:bg-white/5 text-emerald-400">
                <RotateCcw className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => permanentDelete(block.id)} className="p-2 rounded hover:bg-red-500/10 text-red-400">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <CreateBlockModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={createBlock} />

      <Modal open={mergeOpen} onClose={() => setMergeOpen(false)} title={t('results.mergeBlocksTitle', { count: selectedIds.size })}>
        <div className="space-y-4">
          <label className="text-xs uppercase text-muted-foreground">{t('results.mergeBlocksName')}</label>
          <input
            className="nexus-input w-full"
            value={mergeName}
            onChange={(e) => setMergeName(e.target.value)}
            placeholder={`Merged: ${new Date().toISOString().slice(0, 10)}`}
          />
          <button
            type="button"
            onClick={mergeSelectedBlocks}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-white"
            style={{ background: 'var(--nexus-accent)' }}
          >
            {t('results.mergeBlocks')}
          </button>
        </div>
      </Modal>

      <Modal open={!!editBlock} onClose={() => setEditBlock(null)} title={t('results.editBlock')}>
        <div className="space-y-4">
          <input
            className="nexus-input w-full"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <div>
            <label className="text-xs uppercase text-muted-foreground">{t('results.linksLabel')}</label>
            <textarea
              className="nexus-input w-full h-40 mt-1 font-mono text-sm"
              value={editLinks}
              onChange={(e) => setEditLinks(e.target.value)}
              placeholder={t('results.linksPlaceholder')}
            />
          </div>
          <button
            type="button"
            onClick={saveEditBlock}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-white"
            style={{ background: 'var(--nexus-accent)' }}
          >
            {t('common.save')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
