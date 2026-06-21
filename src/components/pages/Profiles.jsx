import { useCallback, useEffect, useMemo, useState, startTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Plus, Play, ChevronDown, FolderPlus, Folder, Users, Shuffle, Square, Trash2, Skull } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import Modal from '../ui/Modal';
import TerminalLog from '../ui/TerminalLog';
import LinkAccountCell from '../profiles/LinkAccountCell';
import PageHeader from '../layout/PageHeader';

function parseProxiesFromText(text) {
  return text.split('\n').filter(Boolean).map((line) => {
    const [host, port, username, password] = line.split(':');
    return {
      host: host?.trim(),
      port: parseInt(port, 10),
      username: username || '',
      password: password || '',
      type: 'http',
    };
  }).filter((p) => p.host && !Number.isNaN(p.port));
}

const FOLDER_COLOR_MAP = {
  blue: '#3370FF',
  teal: '#209E91',
  orange: '#FB9247',
};

const STATUS_COLORS = {
  ban: 'bg-red-500/20 text-red-400 border-red-500/30',
  uploaded: 'bg-green-500/20 text-green-400 border-green-500/30',
  none: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  running: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  ready: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

const STATUS_OPTIONS = ['all', 'none', 'uploaded', 'ban', 'running', 'ready'];
const PAGE_SIZE = 50;

function getProfileFolderId(p) {
  return p.profileFolder?.id || p.folderId || null;
}

export default function Profiles() {
  const { t } = useTranslation();
  const { selectedProfileIds, setSelectedProfileIds, showToast } = useAppStore();
  const [profiles, setProfiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedFolderIds, setSelectedFolderIds] = useState([]);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createLogs, setCreateLogs] = useState([]);
  const [createProgress, setCreateProgress] = useState(null);
  const [form, setForm] = useState({ startNumber: 1, count: 0, profilesPerProxy: 1, folderId: '' });
  const [proxyText, setProxyText] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [openingId, setOpeningId] = useState(null);
  const [moveFolderId, setMoveFolderId] = useState('');
  const [showBansOnly, setShowBansOnly] = useState(false);
  const [deadProxyOpen, setDeadProxyOpen] = useState(false);
  const [deadProxies, setDeadProxies] = useState([]);
  const [deadProxyInput, setDeadProxyInput] = useState('');
  const [deadProxyMatches, setDeadProxyMatches] = useState([]);
  const [replaceLoading, setReplaceLoading] = useState(false);
  const [replaceLogs, setReplaceLogs] = useState([]);
  const [page, setPage] = useState(0);
  const [browserType, setBrowserType] = useState('mostlogin');
  const [accountsList, setAccountsList] = useState([]);

  useEffect(() => {
    window.nexusAPI?.getDeadProxies?.().then((list) => setDeadProxies(list || []));
    const unsub = window.nexusAPI?.onProfilesReplaceProgress?.((msg) => {
      const text = typeof msg === 'string' ? msg : msg?.message || JSON.stringify(msg);
      setReplaceLogs((prev) => [...prev.slice(-199), { text, ts: Date.now() }]);
    });
    return () => unsub?.();
  }, []);

  const loadDeadProxyMatches = useCallback(async () => {
    const res = await window.nexusAPI?.getDeadProxyProfiles?.();
    if (res?.ok) setDeadProxyMatches(res.profiles || []);
  }, []);

  const loadAccounts = useCallback(async () => {
    const data = await window.nexusAPI?.getAccounts();
    const list = [];
    (data?.blocks || []).forEach((block) => {
      (block.accounts || []).forEach((acc) => {
        list.push({ ...acc, blockId: block.id });
      });
    });
    setAccountsList(list);
  }, []);

  useEffect(() => {
    window.nexusAPI?.getSettings().then((r) => {
      if (r?.settings?.browserProvider) setBrowserType(r.settings.browserProvider);
    });
  }, []);

  const loadFolders = useCallback(async () => {
    const res = await window.nexusAPI?.listFolders(browserType);
    if (res?.ok) setFolders(res.folders || []);
  }, [browserType]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await window.nexusAPI?.listProfiles(browserType);
    if (res?.ok) setProfiles(res.profiles || []);
    else showToast(res?.error || t('profiles.mostloginOffline'), 'error');
    useAppStore.getState().setMostloginOnline(res?.ok);
    setLoading(false);
  }, [showToast, t, browserType]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    load();
    loadFolders();
  }, [browserType, load, loadFolders]);

  useEffect(() => {
    const unsub = window.nexusAPI?.onProfilesCreateProgress?.((p) => {
      setCreateProgress(p);
      setCreateLogs((l) => [...l, {
        time: new Date().toLocaleTimeString(),
        text: p.message,
        error: p.error,
        success: !p.error && !p.message?.includes('Ошибка'),
      }]);
    });
    return () => unsub?.();
  }, []);

  const toggleFolder = (folderId, ctrlKey) => {
    setPage(0);
    if (ctrlKey) {
      setSelectedFolderIds((prev) => (
        prev.includes(folderId) ? prev.filter((id) => id !== folderId) : [...prev, folderId]
      ));
    } else {
      setSelectedFolderIds((prev) => (prev.length === 1 && prev[0] === folderId ? [] : [folderId]));
    }
  };

  const matchesStatus = (p) => {
    if (showBansOnly && (p.localStatus || 'none') !== 'ban') return false;
    if (statusFilter === 'all') return true;
    if (statusFilter === 'running') return p.started === 1;
    if (statusFilter === 'ready') return p.started !== 1;
    return (p.localStatus || 'none') === statusFilter;
  };

  const filtered = useMemo(() => profiles.filter((p) => {
    if (selectedFolderIds.length && !selectedFolderIds.includes(getProfileFolderId(p))) return false;
    if (!matchesStatus(p)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = `${p.title || ''} ${p.channelName || ''} ${p.id || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [profiles, selectedFolderIds, statusFilter, search, showBansOnly]);

  const selectedSet = useMemo(() => new Set(selectedProfileIds), [selectedProfileIds]);

  const accountLinkMap = useMemo(() => {
    const map = new Map();
    profiles.forEach((p) => {
      if (p.linkedAccountId) map.set(p.linkedAccountId, p.id);
    });
    accountsList.forEach((acc) => {
      if (acc.profileId) map.set(acc.id, acc.profileId);
    });
    return map;
  }, [profiles, accountsList]);

  const getAvailableAccountsForProfile = useCallback((profileId) => (
    accountsList.filter((acc) => {
      const ownerProfileId = accountLinkMap.get(acc.id);
      return !ownerProfileId || ownerProfileId === profileId;
    })
  ), [accountsList, accountLinkMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  useEffect(() => {
    if (page >= totalPages) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  const selectedOnPage = useMemo(
    () => pageItems.filter((p) => selectedSet.has(p.id)).length,
    [pageItems, selectedSet],
  );

  const allPageSelected = pageItems.length > 0 && selectedOnPage === pageItems.length;

  const toggleSelect = (id) => {
    setSelectedProfileIds(
      selectedSet.has(id)
        ? selectedProfileIds.filter((x) => x !== id)
        : [...selectedProfileIds, id],
    );
  };

  const toggleSelectAllPage = () => {
    startTransition(() => {
      if (allPageSelected) {
        const pageIds = new Set(pageItems.map((p) => p.id));
        setSelectedProfileIds(selectedProfileIds.filter((id) => !pageIds.has(id)));
      } else {
        const merged = new Set(selectedProfileIds);
        pageItems.forEach((p) => merged.add(p.id));
        setSelectedProfileIds([...merged]);
      }
    });
  };

  const toggleSelectAllFiltered = () => {
    startTransition(() => {
      const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selectedSet.has(p.id));
      if (allFilteredSelected) {
        const filteredIds = new Set(filtered.map((p) => p.id));
        setSelectedProfileIds(selectedProfileIds.filter((id) => !filteredIds.has(id)));
      } else {
        const merged = new Set(selectedProfileIds);
        filtered.forEach((p) => merged.add(p.id));
        setSelectedProfileIds([...merged]);
      }
    });
  };

  const handleCreate = async () => {
    setCreateOpen(true);
    setCreateLogs([]);
    const proxies = proxyText.split('\n').filter(Boolean).map((line) => {
      const [host, port, username, password] = line.split(':');
      return { host, port: parseInt(port, 10), username: username || '', password: password || '', type: 'http' };
    }).filter((p) => p.host);

    await window.nexusAPI?.createProfilesBulk({
      count: form.count,
      startNumber: form.startNumber,
      profilesPerProxy: form.profilesPerProxy,
      folderId: form.folderId || selectedFolderIds[0] || undefined,
      proxies: proxies.length ? proxies : [],
      browserType,
    });
    setCreateOpen(false);
    load();
    loadFolders();
  };

  const importProxies = async () => {
    const res = await window.nexusAPI?.parseProxyFile();
    if (res?.ok) setProxyText(res.proxies.map((p) => `${p.host}:${p.port}:${p.username}:${p.password}`).join('\n'));
  };

  const fetchSpace = async () => {
    const res = await window.nexusAPI?.fetchSpaceProxies(form.count || 10, {
      browserType,
      maxPerProxy: form.profilesPerProxy || 4,
    });
    if (res?.ok) {
      setProxyText(res.proxies.map((p) => `${p.host}:${p.port}:${p.username}:${p.password}`).join('\n'));
      if (res.discarded > 0) showToast(`Отброшено ${res.discarded} прокси (лимит на IP)`, 'info');
    } else showToast(res?.error || t('profiles.spaceProxyError'), 'error');
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const res = await window.nexusAPI?.createFolder({
      folderName: newFolderName.trim(),
      folderColor: '#3370FF',
      sortOrder: 0,
    }, browserType);
    if (res?.ok) {
      showToast(t('profiles.folderCreated'));
      setNewFolderName('');
      setShowNewFolder(false);
      loadFolders();
    } else {
      showToast(res?.error || t('profiles.spaceProxyError'), 'error');
    }
  };

  const handleMoveToFolder = async () => {
    if (!moveFolderId || !selectedProfileIds.length) return;
    const res = await window.nexusAPI?.moveProfilesToFolder({
      profileIds: selectedProfileIds,
      folderId: moveFolderId,
      browserType,
    });
    if (res?.ok) {
      showToast(t('profiles.movedToFolder'));
      setMoveFolderId('');
      load();
      loadFolders();
    } else {
      showToast(res?.error || t('profiles.mostloginOffline'), 'error');
    }
  };

  const handleOpenProfile = async (profile) => {
    const profileId = profile?.id || profile?.profileId;
    if (!profileId) {
      showToast('ID профиля не найден. Нажмите «Обновить».', 'error');
      return;
    }
    setOpeningId(profileId);
    const res = await window.nexusAPI?.openProfile(String(profileId), browserType);
    setOpeningId(null);
    if (res?.ok) {
      showToast(`Профиль «${profile.title || profileId.slice(0, 8)}» запущен`);
      load();
    } else {
      showToast(res?.error || t('profiles.mostloginOffline'), 'error');
    }
  };

  const handleStatusChange = async (profileId, status) => {
    await window.nexusAPI?.updateProfileStatus({ profileId, status });
    setProfiles((prev) => prev.map((p) => (p.id === profileId ? { ...p, localStatus: status } : p)));
    if (status === 'ban') {
      const profile = profiles.find((p) => p.id === profileId);
      const ip = profile?.proxy?.host;
      if (ip) {
        const list = await window.nexusAPI?.getDeadProxies?.() || [];
        if (!list.includes(ip)) {
          const next = [...list, ip];
          await window.nexusAPI?.setDeadProxies?.(next);
          setDeadProxies(next);
        }
      }
    }
  };

  const handleMarkReady = async (profileId) => {
    await window.nexusAPI?.updateProfileStatus({ profileId, status: 'uploaded' });
    setProfiles((prev) => prev.map((p) => (p.id === profileId ? { ...p, localStatus: 'uploaded' } : p)));
    showToast(t('profiles.markReadyDone'));
  };

  const applyProxiesToSelection = async (mode) => {
    const proxies = parseProxiesFromText(proxyText);
    if (!selectedProfileIds.length) {
      showToast(t('profiles.assignProxiesNeedSelection'), 'error');
      return;
    }
    if (!proxies.length) {
      showToast(t('profiles.addProxy'), 'error');
      return;
    }
    const res = await window.nexusAPI?.assignProxies?.({
      profileIds: selectedProfileIds,
      proxies,
      mode,
      browserType,
    });
    if (res?.ok) {
      showToast(t('profiles.assignProxiesDone', { count: res.updated ?? selectedProfileIds.length }));
      load();
    } else {
      showToast(res?.error || t('profiles.assignProxiesMostloginOnly'), 'error');
    }
  };

  const replaceProxiesFromSpace = async () => {
    if (!selectedProfileIds.length) {
      showToast(t('profiles.assignProxiesNeedSelection'), 'error');
      return;
    }
    const res = await window.nexusAPI?.fetchSpaceProxies(selectedProfileIds.length, { browserType });
    if (!res?.ok || !res.proxies?.length) {
      showToast(res?.error || t('profiles.spaceProxyError'), 'error');
      return;
    }
    const assign = await window.nexusAPI?.assignProxies?.({
      profileIds: selectedProfileIds,
      proxies: res.proxies,
      mode: 'sequential',
      browserType,
    });
    if (assign?.ok) {
      showToast(t('profiles.replaceFromSpaceDone', { count: assign.updated ?? selectedProfileIds.length }));
      load();
    } else {
      showToast(assign?.error || t('profiles.spaceProxyError'), 'error');
    }
  };

  const handleStopProfile = async (profile) => {
    const profileId = profile?.id || profile?.profileId;
    if (!profileId) return;
    const res = await window.nexusAPI?.closeProfile(String(profileId), browserType);
    if (res?.ok) {
      showToast(t('profiles.stopProfile'));
      load();
    } else {
      showToast(res?.error || t('profiles.mostloginOffline'), 'error');
    }
  };

  const handleDeleteSelected = async () => {
    if (!selectedProfileIds.length) return;
    if (!window.confirm(t('profiles.deleteConfirm', { count: selectedProfileIds.length }))) return;
    const res = await window.nexusAPI?.deleteProfiles(selectedProfileIds, browserType);
    if (res?.ok) {
      showToast(t('profiles.deleted', { count: selectedProfileIds.length }));
      setSelectedProfileIds([]);
      load();
    } else {
      showToast(res?.error || t('profiles.mostloginOffline'), 'error');
    }
  };

  const openDeadProxyModal = async () => {
    setDeadProxyOpen(true);
    await loadDeadProxyMatches();
  };

  const saveDeadProxies = async (list) => {
    await window.nexusAPI?.setDeadProxies?.(list);
    setDeadProxies(list);
    await loadDeadProxyMatches();
  };

  const addDeadProxyIp = async () => {
    const ip = deadProxyInput.trim();
    if (!ip) return;
    const next = [...new Set([...(deadProxies || []), ip])];
    setDeadProxyInput('');
    await saveDeadProxies(next);
  };

  const removeDeadProxyIp = async (ip) => {
    await saveDeadProxies((deadProxies || []).filter((x) => x !== ip));
  };

  const runReplaceDeadProxies = async () => {
    setReplaceLoading(true);
    setReplaceLogs([]);
    const res = await window.nexusAPI?.replaceDeadProxies?.({ maxPerProxy: form.profilesPerProxy || 4 });
    setReplaceLoading(false);
    if (res?.ok) {
      showToast(t('profiles.replaceFromSpaceDone', { count: res.updated || 0 }));
      load();
      await loadDeadProxyMatches();
    } else {
      showToast(res?.error || t('profiles.spaceProxyError'), 'error');
    }
  };

  const runReplaceBans = async () => {
    setReplaceLoading(true);
    setReplaceLogs([]);
    const res = await window.nexusAPI?.replaceBanProfiles?.({ maxPerProxy: form.profilesPerProxy || 4 });
    setReplaceLoading(false);
    if (res?.ok !== false) {
      showToast(t('profiles.replaceBansDone', { deleted: res.deleted || 0, updated: res.updated || 0 }));
      load();
      await loadDeadProxyMatches();
    } else {
      showToast(res?.error || t('profiles.spaceProxyError'), 'error');
    }
  };

  const handleNotesChange = async (profileId, notes) => {
    await window.nexusAPI?.updateProfileStatus({ profileId, notes });
    setProfiles((prev) => prev.map((p) => (p.id === profileId ? { ...p, notes } : p)));
  };

  const handleLinkAccount = async (profileId, value) => {
    if (!value) {
      await window.nexusAPI?.linkProfileAccount({ profileId, accountId: null });
      setProfiles((prev) => prev.map((p) => (p.id === profileId ? { ...p, linkedAccountId: null, linkedEmail: null } : p)));
      await loadAccounts();
      return;
    }
    const acc = accountsList.find((a) => a.id === value);
    if (!acc) return;
    await window.nexusAPI?.linkProfileAccount({
      profileId,
      accountId: acc.id,
      accountEmail: acc.login,
      blockId: acc.blockId,
    });
    setProfiles((prev) => prev.map((p) => (
      p.id === profileId ? { ...p, linkedAccountId: acc.id, linkedEmail: acc.login } : p
    )));
    await loadAccounts();
  };

  const getStatusClass = (p) => {
    if (p.started === 1) return STATUS_COLORS.running;
    return STATUS_COLORS[p.localStatus] || STATUS_COLORS.ready;
  };

  const profileCountLabel = t('profiles.profileCount', { count: filtered.length });

  return (
    <div className="h-full flex gap-4 overflow-hidden">
      <aside className="w-52 shrink-0 flex flex-col nexus-card overflow-hidden">
        <div className="px-3 py-2 border-b text-xs font-medium text-nexus-dim" style={{ borderColor: 'var(--nexus-border)' }}>
          {t('profiles.folders')}
        </div>
        <p className="px-3 py-2 text-[10px] text-nexus-dim leading-snug border-b" style={{ borderColor: 'var(--nexus-border)' }}>
          {t('profiles.folderHint')}
        </p>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          <button
            type="button"
            onClick={() => { setSelectedFolderIds([]); setPage(0); }}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition ${selectedFolderIds.length === 0 ? 'bg-purple-500/15 text-white' : 'hover:bg-white/5 text-nexus-dim'}`}
          >
            <Folder className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t('profiles.allProfiles')}</span>
            <span className="ml-auto text-[10px] opacity-60">{profiles.length}</span>
          </button>
          {folders.map((folder) => {
            const active = selectedFolderIds.includes(folder.id);
            const color = FOLDER_COLOR_MAP[folder.folderColor] || folder.folderColor || '#3370FF';
            return (
              <button
                key={folder.id}
                type="button"
                onClick={(e) => toggleFolder(folder.id, e.ctrlKey || e.metaKey)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition ${active ? 'bg-purple-500/15 text-white' : 'hover:bg-white/5 text-nexus-dim'}`}
              >
                <span className="w-3 h-3 rounded shrink-0" style={{ background: color }} />
                <span className="truncate">{folder.folderName}</span>
                <span className="ml-auto text-[10px] opacity-60">{folder.resourceCount ?? 0}</span>
              </button>
            );
          })}
        </div>
        <div className="p-2 border-t" style={{ borderColor: 'var(--nexus-border)' }}>
          {showNewFolder ? (
            <div className="space-y-2">
              <input
                className="nexus-input text-xs"
                placeholder={t('profiles.folderName')}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
              />
              <div className="flex gap-1">
                <button type="button" onClick={handleCreateFolder} className="flex-1 px-2 py-1 text-xs rounded text-white" style={{ background: 'var(--nexus-accent)' }}>
                  {t('common.create')}
                </button>
                <button type="button" onClick={() => setShowNewFolder(false)} className="px-2 py-1 text-xs rounded border" style={{ borderColor: 'var(--nexus-border)' }}>
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowNewFolder(true)} className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded border hover:bg-white/5" style={{ borderColor: 'var(--nexus-border)' }}>
              <FolderPlus className="w-3.5 h-3.5" />
              {t('profiles.addFolder')}
            </button>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col gap-4 overflow-hidden min-w-0">
        <PageHeader
          icon={Users}
          title={t('profiles.title')}
          description={(
            <>
              <span>{t('profiles.subtitle')}</span>
              <span className="block text-xs text-pink-300/80 mt-1">{t('profiles.workflowSteps')}</span>
            </>
          )}
          actions={(
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <select
              className="nexus-input text-sm py-2"
              value={browserType}
              onChange={(e) => {
                setBrowserType(e.target.value);
                window.nexusAPI?.updateSettings({ browserProvider: e.target.value });
              }}
            >
              <option value="mostlogin">MostLogin</option>
              <option value="vision">Vision</option>
              <option value="zenno">ZennoBrowser</option>
            </select>
            <input
              className="nexus-input text-sm w-40"
              placeholder={t('common.search')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
            {selectedProfileIds.length > 0 && (
              <>
                <span className="text-sm px-3 py-1 rounded-full border text-primary" style={{ borderColor: 'color-mix(in srgb, var(--nexus-accent) 40%, transparent)' }}>
                  {t('profiles.selected')}: {selectedProfileIds.length}
                </span>
                <button
                  type="button"
                  onClick={() => applyProxiesToSelection('sequential')}
                  className="px-3 py-1.5 text-xs rounded-lg border hover:bg-white/5"
                  style={{ borderColor: 'var(--nexus-border)' }}
                >
                  {t('profiles.assignProxies')}
                </button>
                <button
                  type="button"
                  onClick={() => applyProxiesToSelection('random')}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border hover:bg-white/5"
                  style={{ borderColor: 'var(--nexus-border)' }}
                >
                  <Shuffle className="w-3 h-3" />
                  {t('profiles.randomizeProxies')}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="w-3 h-3" />
                  {t('profiles.deleteSelected')}
                </button>
                <button
                  type="button"
                  onClick={replaceProxiesFromSpace}
                  className="px-3 py-1.5 text-xs rounded-lg border hover:bg-white/5"
                  style={{ borderColor: 'var(--nexus-border)' }}
                >
                  {t('profiles.replaceFromSpace')}
                </button>
                <select
                  className="nexus-input text-xs py-1.5"
                  value={moveFolderId}
                  onChange={(e) => setMoveFolderId(e.target.value)}
                >
                  <option value="">{t('profiles.moveToFolder')}</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>{f.folderName}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!moveFolderId}
                  onClick={handleMoveToFolder}
                  className="px-3 py-1.5 text-xs rounded border hover:bg-white/5 disabled:opacity-40"
                  style={{ borderColor: 'var(--nexus-border)' }}
                >
                  {t('common.move')}
                </button>
              </>
            )}
            <button type="button" onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm hover:bg-white/5">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </button>
            <button
              type="button"
              onClick={openDeadProxyModal}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm hover:bg-white/5"
              style={{ borderColor: 'var(--nexus-border)' }}
            >
              <Skull className="w-4 h-4" />
              {t('profiles.deadProxies')}
            </button>
            <button
              type="button"
              disabled={replaceLoading}
              onClick={runReplaceBans}
              className="px-3 py-2 rounded-lg border text-sm hover:bg-white/5 disabled:opacity-40"
              style={{ borderColor: 'var(--nexus-border)' }}
            >
              {t('profiles.replaceBans')}
            </button>
          </div>
          )}
        />

        <div className="rounded-xl border border-border bg-card p-4 shrink-0">
          <button type="button" onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--nexus-accent)' }}>
            <Plus className="w-4 h-4" /> {t('profiles.quickCreate')}
            <ChevronDown className={`w-4 h-4 transition ${showCreate ? 'rotate-180' : ''}`} />
          </button>
          {showCreate && (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="flex flex-wrap gap-4">
                {['startNumber', 'count', 'profilesPerProxy'].map((key) => (
                  <div key={key}>
                    <label className="text-[10px] uppercase text-nexus-dim">{t(`profiles.${key === 'startNumber' ? 'fromNumber' : key === 'count' ? 'quantity' : 'perProxy'}`)}</label>
                    <input type="number" className="nexus-input mt-1 w-20" value={form[key]} onChange={(e) => setForm({ ...form, [key]: parseInt(e.target.value, 10) || 0 })} />
                  </div>
                ))}
                <div>
                  <label className="text-[10px] uppercase text-nexus-dim">{t('profiles.columnFolder')}</label>
                  <select className="nexus-input mt-1 text-xs" value={form.folderId} onChange={(e) => setForm({ ...form, folderId: e.target.value })}>
                    <option value="">{t('profiles.allProfiles')}</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>{f.folderName}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 items-end">
                <button type="button" onClick={importProxies} className="px-3 py-1.5 text-xs rounded border hover:bg-white/5" style={{ borderColor: 'var(--nexus-border)' }}>{t('profiles.fromFile')}</button>
                <button type="button" onClick={fetchSpace} className="px-3 py-1.5 text-xs rounded border hover:bg-white/5" style={{ borderColor: 'var(--nexus-border)' }}>{t('profiles.fromSpaceProxy')}</button>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] uppercase text-nexus-dim">{t('profiles.proxyList')}</label>
                <textarea className="nexus-input mt-1 w-full h-24 font-mono text-xs" placeholder={t('profiles.proxyPlaceholder')} value={proxyText} onChange={(e) => setProxyText(e.target.value)} />
                {!proxyText.trim() && <p className="text-[10px] text-nexus-dim mt-1 uppercase">{t('profiles.noProxies')}</p>}
              </div>
              <div className="col-span-2 flex items-center justify-between">
                <p className="text-xs text-nexus-dim">{t('profiles.previewNames')}</p>
                <button type="button" onClick={handleCreate} disabled={!form.count} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40" style={{ background: 'var(--nexus-accent)' }}>
                  {t('profiles.createBtn')} [{form.count}]
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between shrink-0 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <select
              className="nexus-input text-xs py-1.5"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{t(`profiles.statusLabels.${s}`)}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => { setShowBansOnly((v) => !v); setPage(0); }}
              className={`px-3 py-1.5 text-xs rounded-lg border transition ${showBansOnly ? 'bg-red-500/15 text-red-300 border-red-500/40' : 'hover:bg-white/5'}`}
              style={{ borderColor: showBansOnly ? undefined : 'var(--nexus-border)' }}
            >
              {showBansOnly ? t('profiles.hideBans') : t('profiles.showBans')}
            </button>
          </div>
          <span className="text-xs text-nexus-dim">{profileCountLabel}</span>
          {filtered.length > PAGE_SIZE && (
            <button
              type="button"
              onClick={toggleSelectAllFiltered}
              className="text-xs text-purple-400 hover:text-purple-300"
            >
              {filtered.every((p) => selectedSet.has(p.id))
                ? t('profiles.deselectAllFiltered')
                : t('profiles.selectAllFiltered')}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar rounded-xl border border-border bg-card flex flex-col min-h-0">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-nexus-dim">{t('profiles.notFound')}</div>
          ) : (
            <>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-nexus-card border-b z-10" style={{ borderColor: 'var(--nexus-border)' }}>
                <tr className="text-left text-nexus-dim text-xs">
                  <th className="p-3 w-10">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAllPage}
                      title={t('profiles.selectAllPage')}
                    />
                  </th>
                  <th className="p-3">{t('profiles.columnProfile')}</th>
                  <th className="p-3">{t('profiles.linkAccount')}</th>
                  <th className="p-3">{t('profiles.columnFolder')}</th>
                  <th className="p-3">{t('profiles.notes')}</th>
                  <th className="p-3">{t('profiles.columnProxy')}</th>
                  <th className="p-3">{t('profiles.columnStatus')}</th>
                  <th className="p-3 w-24">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((p) => (
                  <tr key={p.id} className="border-b hover:bg-white/[0.02]" style={{ borderColor: 'var(--nexus-border)' }}>
                    <td className="p-3"><input type="checkbox" checked={selectedSet.has(p.id)} onChange={() => toggleSelect(p.id)} /></td>
                    <td className="p-3">
                      <div className="font-medium">{p.title || p.name || p.id?.slice(0, 8)}</div>
                      {p.linkedEmail && <div className="text-xs text-nexus-dim">{p.linkedEmail}</div>}
                      {!p.linkedEmail && p.channelName && p.channelName !== p.title && (
                        <div className="text-xs text-nexus-dim">{p.channelName}</div>
                      )}
                    </td>
                    <td className="p-3">
                      <LinkAccountCell
                        value={p.linkedAccountId}
                        accounts={getAvailableAccountsForProfile(p.id)}
                        emptyLabel={t('profiles.noLinkedAccount')}
                        onChange={(accId) => handleLinkAccount(p.id, accId)}
                      />
                    </td>
                    <td className="p-3 text-xs text-nexus-dim">
                      {p.profileFolder?.folderName || t('profiles.noFolder')}
                    </td>
                    <td className="p-3">
                      <input
                        className="nexus-input text-xs py-1 w-full max-w-[140px]"
                        value={p.notes || ''}
                        placeholder="—"
                        onChange={(e) => handleNotesChange(p.id, e.target.value)}
                      />
                    </td>
                    <td className="p-3 text-xs">
                      {p.proxy?.host ? (
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">{t('profiles.proxyReady')}</span>
                          <div className="text-muted-foreground font-mono">{p.proxy.host}:{p.proxy.port || ''}</div>
                        </div>
                      ) : (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-red-400">{t('profiles.noProxy')}</span>
                      )}
                    </td>
                    <td className="p-3">
                      <select
                        value={p.localStatus || 'none'}
                        onChange={(e) => handleStatusChange(p.id, e.target.value)}
                        className={`px-2 py-0.5 rounded text-xs border bg-transparent ${getStatusClass(p)}`}
                      >
                        <option value="none">{t('profiles.statusLabels.none')}</option>
                        <option value="uploaded">{t('profiles.statusLabels.uploaded')}</option>
                        <option value="ban">{t('profiles.statusLabels.ban')}</option>
                      </select>
                      {p.started === 1 && (
                        <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] border ${STATUS_COLORS.running}`}>
                          {t('profiles.statusLabels.running')}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {p.started === 1 ? (
                          <button
                            type="button"
                            onClick={() => handleStopProfile(p)}
                            className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-red-500/30 text-red-400 hover:bg-red-500/10"
                          >
                            <Square className="w-3 h-3 fill-current" />
                            {t('profiles.stopProfile')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={openingId === p.id}
                            onClick={() => handleOpenProfile(p)}
                            className="flex items-center gap-1 px-2 py-1 text-xs rounded border hover:bg-white/5 disabled:opacity-50"
                            style={{ borderColor: 'var(--nexus-border)' }}
                          >
                            <Play className={`w-3 h-3 ${openingId === p.id ? 'animate-pulse' : ''}`} />
                            {openingId === p.id ? t('common.loading') : t('common.start')}
                          </button>
                        )}
                        {(p.localStatus !== 'uploaded' && p.localStatus !== 'ready') && (
                          <button
                            type="button"
                            onClick={() => handleMarkReady(p.id)}
                            className="px-2 py-1 text-xs rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                            title={t('profiles.markReady')}
                          >
                            {t('profiles.markReady')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="shrink-0 flex items-center justify-between px-4 py-2 border-t text-xs text-nexus-dim" style={{ borderColor: 'var(--nexus-border)' }}>
                <span>{t('accounts.pagination', { shown: pageItems.length, total: filtered.length })}</span>
                <div className="flex gap-2 items-center">
                  <button
                    type="button"
                    disabled={safePage === 0}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-3 py-1 rounded border disabled:opacity-30 hover:bg-white/5"
                    style={{ borderColor: 'var(--nexus-border)' }}
                  >
                    {t('accounts.prev')}
                  </button>
                  <span className="font-mono">{safePage + 1}/{totalPages}</span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1 rounded border disabled:opacity-30 hover:bg-white/5"
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

        <Modal open={createOpen} onClose={() => window.nexusAPI?.cancelCreateProfiles()} title={t('profiles.creatingTitle')} wide>
          <TerminalLog logs={createLogs} onClear={() => setCreateLogs([])} title={t('profiles.processLog')} />
          {createProgress && (
            <div className="mt-3 h-1 rounded bg-zinc-800 overflow-hidden">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${(createProgress.current / createProgress.total) * 100}%` }} />
            </div>
          )}
        </Modal>

        <Modal open={deadProxyOpen} onClose={() => setDeadProxyOpen(false)} title={t('profiles.deadProxyTitle')} wide>
          <p className="text-xs text-nexus-dim mb-3">{t('profiles.deadProxyHint')}</p>
          <p className="text-xs text-amber-400 mb-3">{t('profiles.deadProxyProfiles', { count: deadProxyMatches.length })}</p>
          <div className="flex gap-2 mb-3">
            <input
              className="nexus-input flex-1 text-sm font-mono"
              placeholder="192.168.0.1"
              value={deadProxyInput}
              onChange={(e) => setDeadProxyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addDeadProxyIp()}
            />
            <button type="button" onClick={addDeadProxyIp} className="px-3 py-2 text-sm rounded text-white" style={{ background: 'var(--nexus-accent)' }}>
              {t('profiles.deadProxyAdd')}
            </button>
          </div>
          <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-1 mb-4">
            {(deadProxies || []).length === 0 ? (
              <p className="text-xs text-nexus-dim">{t('profiles.deadProxyEmpty')}</p>
            ) : (
              deadProxies.map((ip) => (
                <div key={ip} className="flex items-center justify-between px-2 py-1 rounded border text-xs font-mono" style={{ borderColor: 'var(--nexus-border)' }}>
                  <span>{ip}</span>
                  <button type="button" onClick={() => removeDeadProxyIp(ip)} className="text-red-400 hover:text-red-300">{t('common.delete')}</button>
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            disabled={replaceLoading || !deadProxies?.length}
            onClick={runReplaceDeadProxies}
            className="w-full py-2 rounded text-white disabled:opacity-40 mb-3"
            style={{ background: 'var(--nexus-accent)' }}
          >
            {replaceLoading ? t('common.loading') : t('profiles.deadProxyReplace')}
          </button>
          {replaceLogs.length > 0 && (
            <TerminalLog logs={replaceLogs} onClear={() => setReplaceLogs([])} title={t('profiles.processLog')} />
          )}
        </Modal>
      </div>
    </div>
  );
}
