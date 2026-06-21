import { memo, useMemo, useState, startTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, RefreshCw, ChevronDown } from 'lucide-react';

const PAGE_SIZE = 50;

const STATUS_BADGE = {
  none: 'text-zinc-400 border-zinc-500/30 bg-zinc-500/10',
  uploaded: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  ban: 'text-red-400 border-red-500/30 bg-red-500/10',
  ready: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  running: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
};

function getProfileFolderId(p) {
  return p.profileFolder?.id || p.folderId || null;
}

function getProfileName(p) {
  return p.title || p.name || p.channelName || `#${String(p.id || '').slice(0, 8)}`;
}

const ProfileRow = memo(function ProfileRow({ profile, checked, onToggle, t }) {
  const name = getProfileName(profile);
  const status = profile.started === 1 ? 'running' : (profile.localStatus || 'none');
  const badgeClass = STATUS_BADGE[status] || STATUS_BADGE.none;

  return (
    <tr className="border-t hover:bg-white/[0.02]" style={{ borderColor: 'var(--nexus-border)' }}>
      <td className="px-3 py-1.5">
        <input type="checkbox" checked={checked} onChange={onToggle} />
      </td>
      <td className="px-3 py-1.5 min-w-0">
        <div className="font-medium truncate" title={name}>{name}</div>
        {profile.linkedEmail && (
          <div className="text-[10px] text-nexus-dim truncate" title={profile.linkedEmail}>
            {profile.linkedEmail}
          </div>
        )}
      </td>
      <td className="px-3 py-1.5 text-nexus-dim truncate max-w-[100px]">
        {profile.profileFolder?.folderName || '—'}
      </td>
      <td className="px-3 py-1.5">
        <span className={`px-1.5 py-0.5 rounded text-[10px] border ${badgeClass}`}>
          {t(`profiles.statusLabels.${status === 'running' ? 'running' : profile.localStatus || 'none'}`)}
        </span>
      </td>
    </tr>
  );
});

export default function ProfileSelector({
  profiles,
  folders,
  selectedIds,
  onToggle,
  onToggleAll,
  onRefresh,
  loading,
}) {
  const { t } = useTranslation();
  const [activeFolderId, setActiveFolderId] = useState('all');
  const [readyOnly, setReadyOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  const selectedCount = selectedIds.size;

  const visibleProfiles = useMemo(() => {
    let list = profiles;
    if (activeFolderId !== 'all') {
      list = list.filter((p) => getProfileFolderId(p) === activeFolderId);
    }
    if (readyOnly) {
      list = list.filter((p) => {
        const s = p.localStatus || 'none';
        return s === 'uploaded' || s === 'ready';
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => {
        const hay = `${getProfileName(p)} ${p.linkedEmail || ''} ${p.profileFolder?.folderName || ''}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [profiles, activeFolderId, readyOnly, search]);

  const totalPages = Math.max(1, Math.ceil(visibleProfiles.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = visibleProfiles.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const selectedOnPage = useMemo(
    () => pageItems.filter((p) => selectedIds.has(p.id)).length,
    [pageItems, selectedIds],
  );

  const allPageSelected = pageItems.length > 0 && selectedOnPage === pageItems.length;

  const folderSelectedCount = useMemo(
    () => visibleProfiles.filter((p) => selectedIds.has(p.id)).length,
    [visibleProfiles, selectedIds],
  );

  const handleFolderChange = (id) => {
    setActiveFolderId(id);
    setPage(0);
  };

  const handleToggleAllPage = () => {
    startTransition(() => onToggleAll(pageItems, !allPageSelected));
  };

  const handleToggleAllVisible = () => {
    startTransition(() => {
      const allSelected = folderSelectedCount === visibleProfiles.length;
      onToggleAll(visibleProfiles, !allSelected);
    });
  };

  return (
    <div className={`nexus-card flex flex-col min-h-0 shrink-0 transition-all ${collapsed ? '' : 'max-h-60'}`}>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-white/[0.02] shrink-0"
      >
        <ChevronDown className={`w-4 h-4 text-nexus-dim shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        <span className="text-xs text-nexus-dim uppercase tracking-wide">{t('automation.profileList')}</span>
        {selectedCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full border border-pink-500/40 text-pink-300 bg-pink-500/10">
            {t('automation.selected')}: {selectedCount}
          </span>
        )}
        <span className="ml-auto text-[10px] text-nexus-dim">
          {collapsed ? t('automation.expandProfiles') : t('automation.collapseProfiles')}
        </span>
      </button>

      {!collapsed && (
        <>
      <div className="flex items-center gap-2 px-3 py-2 border-t shrink-0 flex-wrap" style={{ borderColor: 'var(--nexus-border)' }}>
        <button
          type="button"
          onClick={() => handleFolderChange('all')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition ${
            activeFolderId === 'all'
              ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40'
              : 'border border-white/10 text-nexus-dim hover:bg-white/5'
          }`}
        >
          <Folder className="w-3 h-3" />
          {t('profiles.allProfiles')}
        </button>
        {folders.map((folder) => (
          <button
            key={folder.id}
            type="button"
            onClick={() => handleFolderChange(folder.id)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition max-w-[120px] ${
              activeFolderId === folder.id
                ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40'
                : 'border border-white/10 text-nexus-dim hover:bg-white/5'
            }`}
          >
            <span className="truncate">{folder.folderName}</span>
          </button>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-nexus-dim ml-1 cursor-pointer">
          <input type="checkbox" checked={readyOnly} onChange={(e) => { setReadyOnly(e.target.checked); setPage(0); }} />
          {t('automation.readyOnly')}
        </label>
        <input
          className="nexus-input text-xs py-1 w-32 ml-auto"
          placeholder={t('automation.searchProfile')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
        <button type="button" onClick={onRefresh} disabled={loading} className="p-1 rounded hover:bg-white/5 text-nexus-dim" title={t('common.refresh')}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
        {visibleProfiles.length > PAGE_SIZE && (
          <button type="button" onClick={handleToggleAllVisible} className="text-xs text-pink-300 hover:text-pink-200">
            {folderSelectedCount === visibleProfiles.length
              ? t('automation.deselectAllFolder')
              : t('automation.selectAllFolder')}
          </button>
        )}
      </div>

      <p className="px-3 py-1.5 text-[10px] text-nexus-dim border-b shrink-0" style={{ borderColor: 'var(--nexus-border)' }}>
        {t('automation.workflowHint')}
      </p>

      {visibleProfiles.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-nexus-dim p-4 text-center">
          {readyOnly ? t('automation.noReadyProfiles') : t('profiles.notFound')}
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
                  <th className="px-3 py-1.5 text-left">{t('profiles.columnProfile')}</th>
                  <th className="px-3 py-1.5 text-left">{t('profiles.columnFolder')}</th>
                  <th className="px-3 py-1.5 text-left">{t('profiles.columnStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((p) => (
                  <ProfileRow
                    key={p.id}
                    profile={p}
                    checked={selectedIds.has(p.id)}
                    onToggle={() => onToggle(p.id)}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-t text-xs text-nexus-dim" style={{ borderColor: 'var(--nexus-border)' }}>
              <span>{t('accounts.pagination', { shown: pageItems.length, total: visibleProfiles.length })}</span>
              <div className="flex gap-2 items-center">
                <button type="button" disabled={safePage === 0} onClick={() => setPage((p) => p - 1)} className="px-2 py-0.5 rounded border disabled:opacity-30 hover:bg-white/5" style={{ borderColor: 'var(--nexus-border)' }}>{t('accounts.prev')}</button>
                <span className="font-mono">{safePage + 1}/{totalPages}</span>
                <button type="button" disabled={safePage >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="px-2 py-0.5 rounded border disabled:opacity-30 hover:bg-white/5" style={{ borderColor: 'var(--nexus-border)' }}>{t('accounts.next')}</button>
              </div>
            </div>
          )}
        </>
      )}
        </>
      )}
    </div>
  );
}

export { getProfileName };
