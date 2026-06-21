import { useMemo, useState, startTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder } from 'lucide-react';
import { AccountRow } from './AccountSelectorRow';

const PAGE_SIZE = 50;

export default function AccountSelector({
  blocks,
  profiles,
  activeBlockId,
  onBlockChange,
  selectedIds,
  onToggle,
  onToggleAll,
  onProfileChange,
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);

  const visibleAccounts = useMemo(() => {
    const list = [];
    blocks.forEach((block) => {
      (block.accounts || []).forEach((acc) => {
        list.push({ ...acc, blockId: block.id, blockName: block.name });
      });
    });
    if (activeBlockId === 'all') return list;
    return list.filter((a) => a.blockId === activeBlockId);
  }, [blocks, activeBlockId]);

  const totalPages = Math.max(1, Math.ceil(visibleAccounts.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = visibleAccounts.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const selectedOnPage = useMemo(
    () => pageItems.filter((a) => selectedIds.has(a.id)).length,
    [pageItems, selectedIds],
  );

  const allPageSelected = pageItems.length > 0 && selectedOnPage === pageItems.length;

  const handleBlockChange = (blockId) => {
    onBlockChange(blockId);
    setPage(0);
  };

  const handleToggleAllPage = () => {
    startTransition(() => {
      onToggleAll(pageItems, !allPageSelected);
    });
  };

  const handleToggleAllFolder = () => {
    startTransition(() => {
      const allFolderSelected = folderSelectedCount === visibleAccounts.length;
      onToggleAll(visibleAccounts, !allFolderSelected);
    });
  };

  const folderSelectedCount = useMemo(
    () => visibleAccounts.filter((a) => selectedIds.has(a.id)).length,
    [visibleAccounts, selectedIds],
  );

  return (
    <div className="nexus-card flex flex-col min-h-0 shrink-0 max-h-56">
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0 flex-wrap" style={{ borderColor: 'var(--nexus-border)' }}>
        <span className="text-xs text-nexus-dim uppercase tracking-wide mr-1">{t('automation.accounts')}</span>
        <button
          type="button"
          onClick={() => handleBlockChange('all')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition ${
            activeBlockId === 'all'
              ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40'
              : 'border border-white/10 text-nexus-dim hover:bg-white/5'
          }`}
        >
          <Folder className="w-3 h-3" />
          {t('accounts.allFolders')}
        </button>
        {blocks.map((block) => (
          <button
            key={block.id}
            type="button"
            onClick={() => handleBlockChange(block.id)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition max-w-[120px] ${
              activeBlockId === block.id
                ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40'
                : 'border border-white/10 text-nexus-dim hover:bg-white/5'
            }`}
          >
            <span className="truncate">{block.name}</span>
            <span className="opacity-60 shrink-0">{block.accounts?.length || 0}</span>
          </button>
        ))}
        {visibleAccounts.length > PAGE_SIZE && (
          <button
            type="button"
            onClick={handleToggleAllFolder}
            className="ml-auto text-xs text-pink-300 hover:text-pink-200 transition"
          >
            {folderSelectedCount === visibleAccounts.length
              ? t('automation.deselectAllFolder')
              : t('automation.selectAllFolder')}
          </button>
        )}
      </div>

      {visibleAccounts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-nexus-dim p-4">
          {t('accounts.noAccounts')}
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-nexus-card text-nexus-dim uppercase tracking-wide z-10">
                <tr>
                  <th className="px-3 py-1.5 w-10">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={handleToggleAllPage}
                      title={t('automation.selectAllPage')}
                    />
                  </th>
                  <th className="px-3 py-1.5 text-left">Email</th>
                  <th className="px-3 py-1.5 text-left w-44">{t('automation.profile')}</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((acc) => (
                  <AccountRow
                    key={acc.id}
                    account={acc}
                    checked={selectedIds.has(acc.id)}
                    profiles={profiles}
                    onToggle={() => onToggle(acc.id)}
                    onProfileChange={onProfileChange}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-t text-xs text-nexus-dim" style={{ borderColor: 'var(--nexus-border)' }}>
              <span>{t('accounts.pagination', { shown: pageItems.length, total: visibleAccounts.length })}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="px-2 py-0.5 rounded border disabled:opacity-30 hover:bg-white/5"
                  style={{ borderColor: 'var(--nexus-border)' }}
                >
                  {t('accounts.prev')}
                </button>
                <span className="font-mono">{safePage + 1}/{totalPages}</span>
                <button
                  type="button"
                  disabled={safePage >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  className="px-2 py-0.5 rounded border disabled:opacity-30 hover:bg-white/5"
                  style={{ borderColor: 'var(--nexus-border)' }}
                >
                  {t('accounts.next')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
