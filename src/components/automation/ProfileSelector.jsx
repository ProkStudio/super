import { memo, useMemo, useState, startTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, RefreshCw, Users } from 'lucide-react';
import Checkbox from '../ui/Checkbox';
import {
  countProfilesByFolder,
  getProfileFolderId,
  getProfileName,
  normalizeFolderId,
  profileInFolders,
} from '../../lib/profileUtils';

const PAGE_SIZE = 50;

const FOLDER_COLOR_MAP = {
  blue: '#3370FF',
  teal: '#209E91',
  orange: '#FB9247',
};

const STATUS_COLORS = {
  none: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  uploaded: 'bg-green-500/20 text-green-400 border-green-500/30',
  ban: 'bg-red-500/20 text-red-400 border-red-500/30',
  ready: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  running: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  logged_out: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  verify: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  waf: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const STATUS_OPTIONS = ['all', 'none', 'uploaded', 'ready', 'ban', 'running'];

function getStatusKey(profile) {
  if (profile.started === 1) return 'running';
  return profile.localStatus || 'none';
}

function statusLabelKey(profile, variant) {
  const key = getStatusKey(profile);
  if (variant === 'tiktok' && key !== 'running') {
    const tiktokKey = profile.tiktokReady ? 'ready' : (profile.localStatus || 'none');
    if (['active', 'logged_out', 'verify', 'waf', 'ban', 'ready', 'none', 'error'].includes(tiktokKey)) {
      return `tiktok.accounts.status.${tiktokKey === 'ban' ? 'banned' : tiktokKey}`;
    }
  }
  return `profiles.statusLabels.${key}`;
}

const ProfileRow = memo(function ProfileRow({
  profile,
  checked,
  onToggle,
  t,
  variant,
}) {
  const name = getProfileName(profile);
  const statusKey = getStatusKey(profile);
  const badgeClass = STATUS_COLORS[statusKey] || STATUS_COLORS.none;
  const folderName = profile.profileFolder?.folderName || '—';
  const proxyHost = profile.proxy?.host;

  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      className={`border-b cursor-pointer transition-colors ${
        checked ? 'bg-[color-mix(in_srgb,var(--nexus-accent)_8%,transparent)]' : 'hover:bg-white/[0.03]'
      }`}
      style={{ borderColor: 'var(--nexus-border)' }}
    >
      <td className="p-2.5 w-10" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={checked} onChange={onToggle} size="sm" />
      </td>
      <td className="p-2.5 min-w-0">
        <div className="font-medium truncate text-sm" title={name}>{name}</div>
        {variant !== 'tiktok' && profile.tiktokUsername && (
          <div className="text-[11px] text-[var(--nexus-accent)] truncate">@{profile.tiktokUsername}</div>
        )}
        {profile.linkedEmail && (
          <div className="text-[10px] text-nexus-dim truncate" title={profile.linkedEmail}>
            {profile.linkedEmail}
          </div>
        )}
      </td>
      {variant === 'tiktok' && (
        <td className="p-2.5 text-nexus-dim truncate max-w-[120px] text-xs font-mono">
          {profile.tiktokUsername ? `@${profile.tiktokUsername}` : '—'}
        </td>
      )}
      <td className="p-2.5 text-nexus-dim truncate max-w-[100px] text-xs">{folderName}</td>
      <td className="p-2.5 text-nexus-dim font-mono text-[10px] truncate max-w-[90px]" title={proxyHost}>
        {proxyHost || '—'}
      </td>
      <td className="p-2.5 font-mono text-[10px] text-nexus-dim truncate max-w-[72px]" title={profile.id}>
        {String(profile.id || '').slice(0, 8)}
      </td>
      <td className="p-2.5">
        <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] border whitespace-nowrap ${badgeClass}`}>
          {t(statusLabelKey(profile, variant))}
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
  variant = 'youtube',
}) {
  const { t } = useTranslation();
  const [selectedFolderIds, setSelectedFolderIds] = useState([]);
  const [readyOnly, setReadyOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const selectedCount = selectedIds.size;

  const folderCounts = useMemo(() => countProfilesByFolder(profiles), [profiles]);

  const getFolderCount = (folder) => {
    const id = normalizeFolderId(folder.id);
    const fromProfiles = id ? folderCounts.get(id) : 0;
    if (fromProfiles > 0) return fromProfiles;
    if (folder.resourceCount != null && folder.resourceCount > 0) return folder.resourceCount;
    return fromProfiles || 0;
  };

  const visibleProfiles = useMemo(() => {
    let list = profiles;
    if (selectedFolderIds.length) {
      list = list.filter((p) => profileInFolders(p, selectedFolderIds));
    }
    if (readyOnly) {
      list = list.filter((p) => {
        const s = p.localStatus || 'none';
        if (variant === 'tiktok') return p.tiktokReady || s === 'ready' || s === 'active';
        return s === 'uploaded' || s === 'ready';
      });
    }
    if (statusFilter !== 'all') {
      list = list.filter((p) => {
        if (statusFilter === 'running') return p.started === 1;
        if (statusFilter === 'ready') {
          if (variant === 'tiktok') return p.tiktokReady || p.localStatus === 'ready' || p.localStatus === 'active';
          return p.localStatus === 'uploaded' || p.localStatus === 'ready';
        }
        return getStatusKey(p) === statusFilter || p.localStatus === statusFilter;
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => {
        const hay = `${getProfileName(p)} ${p.linkedEmail || ''} ${p.profileFolder?.folderName || ''} ${p.tiktokUsername || ''} ${p.id || ''}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [profiles, selectedFolderIds, readyOnly, statusFilter, search, variant]);

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

  const toggleFolder = (folderId, ctrlKey) => {
    const id = normalizeFolderId(folderId);
    if (!id) return;
    setPage(0);
    if (ctrlKey) {
      setSelectedFolderIds((prev) => (
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      ));
    } else {
      setSelectedFolderIds((prev) => (prev.length === 1 && prev[0] === id ? [] : [id]));
    }
  };

  const handleToggleAllPage = () => {
    startTransition(() => onToggleAll(pageItems, !allPageSelected));
  };

  const handleToggleAllVisible = () => {
    startTransition(() => {
      const allSelected = folderSelectedCount === visibleProfiles.length && visibleProfiles.length > 0;
      onToggleAll(visibleProfiles, !allSelected);
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card flex flex-col min-h-[240px] max-h-[min(42vh,380px)] shrink-0 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b shrink-0 flex-wrap" style={{ borderColor: 'var(--nexus-border)' }}>
        <Users className="w-4 h-4 text-nexus-dim shrink-0" />
        <span className="text-sm font-medium">{t('automation.profileList')}</span>
        <span
          className="flex items-center gap-1.5 px-3 h-8 rounded-md border text-xs font-medium"
          style={{
            borderColor: 'color-mix(in srgb, var(--nexus-accent) 35%, transparent)',
            background: 'color-mix(in srgb, var(--nexus-accent) 10%, transparent)',
            color: 'var(--nexus-accent)',
          }}
        >
          {t('profiles.selected')}: {selectedCount}
        </span>
        <span className="text-[11px] text-nexus-dim ml-1">
          {t('profiles.profileCount', { count: visibleProfiles.length })}
        </span>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleToggleAllVisible}
            className="text-xs px-2.5 py-1 rounded-lg border hover:bg-white/5 transition"
            style={{ borderColor: 'var(--nexus-border)', color: 'var(--nexus-accent)' }}
          >
            {folderSelectedCount === visibleProfiles.length && visibleProfiles.length > 0
              ? t('profiles.deselectAllFiltered')
              : t('profiles.selectAllFiltered')}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs hover:bg-white/5 disabled:opacity-50"
            style={{ borderColor: 'var(--nexus-border)' }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <aside className="w-44 shrink-0 flex flex-col border-r overflow-hidden" style={{ borderColor: 'var(--nexus-border)' }}>
          <div className="px-2.5 py-2 text-[10px] uppercase tracking-wide text-nexus-dim border-b" style={{ borderColor: 'var(--nexus-border)' }}>
            {t('profiles.folders')}
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-1.5 space-y-0.5">
            <button
              type="button"
              onClick={() => { setSelectedFolderIds([]); setPage(0); }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition ${
                selectedFolderIds.length === 0
                  ? 'bg-[color-mix(in_srgb,var(--nexus-accent)_15%,transparent)] text-white'
                  : 'hover:bg-white/5 text-nexus-dim'
              }`}
            >
              <Folder className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t('profiles.allProfiles')}</span>
              <span className="ml-auto text-[10px] opacity-60">{profiles.length}</span>
            </button>
            {folders.map((folder) => {
              const id = normalizeFolderId(folder.id);
              const active = selectedFolderIds.includes(id);
              const color = FOLDER_COLOR_MAP[folder.folderColor] || folder.folderColor || '#3370FF';
              const count = getFolderCount(folder);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={(e) => toggleFolder(id, e.ctrlKey || e.metaKey)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition ${
                    active
                      ? 'bg-[color-mix(in_srgb,var(--nexus-accent)_15%,transparent)] text-white'
                      : 'hover:bg-white/5 text-nexus-dim'
                  }`}
                  title={t('profiles.folderHint')}
                >
                  <span className="w-2.5 h-2.5 rounded shrink-0" style={{ background: color }} />
                  <span className="truncate">{folder.folderName}</span>
                  <span className="ml-auto text-[10px] opacity-60 tabular-nums">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0 flex-wrap" style={{ borderColor: 'var(--nexus-border)' }}>
            <select
              className="nexus-input text-xs py-1.5"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{t(`profiles.statusLabels.${s}`)}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs text-nexus-dim cursor-pointer select-none">
              <Checkbox
                checked={readyOnly}
                onChange={(v) => { setReadyOnly(v); setPage(0); }}
                size="sm"
              />
              {t('automation.readyOnly')}
            </label>
            <input
              className="nexus-input text-xs py-1.5 flex-1 min-w-[120px] max-w-[200px] ml-auto"
              placeholder={t('automation.searchProfile')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>

          {visibleProfiles.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-nexus-dim p-6 text-center">
              {readyOnly ? t('automation.noReadyProfiles') : t('profiles.notFound')}
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card border-b z-10" style={{ borderColor: 'var(--nexus-border)' }}>
                    <tr className="text-left text-nexus-dim text-[10px] uppercase tracking-wide">
                      <th className="p-2.5 w-10">
                        <Checkbox
                          checked={allPageSelected}
                          indeterminate={selectedOnPage > 0 && !allPageSelected}
                          onChange={handleToggleAllPage}
                          size="sm"
                        />
                      </th>
                      <th className="p-2.5">{t('profiles.columnProfile')}</th>
                      {variant === 'tiktok' && <th className="p-2.5">{t('tiktok.accounts.columnUser')}</th>}
                      <th className="p-2.5">{t('profiles.columnFolder')}</th>
                      <th className="p-2.5">{t('profiles.columnProxy')}</th>
                      <th className="p-2.5">{t('profiles.profileId')}</th>
                      <th className="p-2.5">{t('profiles.columnStatus')}</th>
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
                        variant={variant}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="shrink-0 flex items-center justify-between px-3 py-2 border-t text-xs text-nexus-dim" style={{ borderColor: 'var(--nexus-border)' }}>
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
        </div>
      </div>
    </div>
  );
}

export { getProfileName, getProfileFolderId };