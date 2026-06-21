import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Upload, Trash2, Folder, Plus, User, X, ShieldCheck, Loader2, Minus, Download, GitMerge, FileText, Pencil } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import AccountRow from '../accounts/AccountRow';
import Modal from '../ui/Modal';
import TerminalLog from '../ui/TerminalLog';
import PageHeader from '../layout/PageHeader';

const PAGE_SIZE = 50;

function normalizeAccount(acc) {
  return {
    ...acc,
    totp: acc.totp ?? acc.recovery ?? '',
    ready: Boolean(acc.ready),
    status: acc.status || 'unknown',
    statusMessage: acc.statusMessage || '',
  };
}

export default function Accounts() {
  const { t } = useTranslation();
  const { showToast } = useAppStore();
  const [data, setData] = useState({ blocks: [], temp: [] });
  const [activeBlockId, setActiveBlockId] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [copiedMap, setCopiedMap] = useState({});
  const [expandedReady, setExpandedReady] = useState({});
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkProgress, setCheckProgress] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [profilesMeta, setProfilesMeta] = useState({});
  const [autofillLoading, setAutofillLoading] = useState({});
  const [checkThreads, setCheckThreads] = useState(2);
  const [selectedBlockIds, setSelectedBlockIds] = useState([]);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeName, setMergeName] = useState('');
  const [renamingBlockId, setRenamingBlockId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [checkLogs, setCheckLogs] = useState([]);
  const [showCheckLog, setShowCheckLog] = useState(false);
  const [browserType, setBrowserType] = useState('mostlogin');

  const persist = useCallback(async (next) => {
    await window.nexusAPI?.setAccounts(next);
    setData(next);
  }, []);

  const load = useCallback(async () => {
    const res = await window.nexusAPI?.getAccounts();
    const raw = res || { blocks: [], temp: [] };
    setData({
      ...raw,
      blocks: (raw.blocks || []).map((b) => ({
        ...b,
        accounts: (b.accounts || []).map(normalizeAccount),
      })),
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    window.nexusAPI?.getProfilesMeta().then((res) => {
      setProfilesMeta(res?.meta || {});
    });
    window.nexusAPI?.getSettings?.().then((s) => {
      if (s?.browserProvider) setBrowserType(s.browserProvider);
    });
  }, []);

  useEffect(() => {
    const unsubProgress = window.nexusAPI?.onAccountsCheckProgress?.((p) => {
      if (p?.percent != null) setCheckProgress(p.percent);
    });
    const unsubLog = window.nexusAPI?.onAccountsCheckLog?.((msg) => {
      const text = typeof msg === 'string' ? msg : msg?.text || msg?.message || JSON.stringify(msg);
      setCheckLogs((prev) => [...prev.slice(-199), { text, ts: Date.now() }]);
    });
    return () => {
      unsubProgress?.();
      unsubLog?.();
    };
  }, []);

  const allAccounts = useMemo(() => {
    const list = [];
    data.blocks.forEach((block) => {
      block.accounts.forEach((acc) => {
        list.push({ ...acc, blockId: block.id, blockName: block.name });
      });
    });
    return list;
  }, [data.blocks]);

  const filtered = useMemo(() => {
    let list = allAccounts;
    if (activeBlockId !== 'all') {
      list = list.filter((a) => a.blockId === activeBlockId);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((a) => a.login?.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') {
      list = list.filter((a) => (a.status || 'unknown') === statusFilter);
    }
    return list;
  }, [allAccounts, activeBlockId, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => {
    if (page >= totalPages) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  const getCopied = (accId) => copiedMap[accId] || { email: false, password: false, totp: false };

  const profileIdForAccount = useCallback((accId) => {
    for (const [pid, m] of Object.entries(profilesMeta)) {
      if (m?.linkedAccountId === accId) return pid;
    }
    return null;
  }, [profilesMeta]);

  const markReady = useCallback(async (blockId, accId) => {
    const next = {
      ...data,
      blocks: data.blocks.map((b) => b.id !== blockId ? b : {
        ...b,
        accounts: b.accounts.map((a) => a.id === accId ? { ...a, ready: true } : a),
      }),
    };
    await persist(next);
  }, [data, persist]);

  const copyField = useCallback(async (blockId, acc, field, value) => {
    if (!value || value === '—') return;
    await window.nexusAPI?.copyToClipboard(value);

    const hasTotp = Boolean(acc.totp?.trim());

    setCopiedMap((m) => {
      const prev = m[acc.id] || { email: false, password: false, totp: false };
      const nextCopied = { ...prev, [field]: true };
      const emailDone = field === 'email' ? true : prev.email;
      const passwordDone = field === 'password' ? true : prev.password;
      const totpDone = hasTotp ? (field === 'totp' ? true : prev.totp) : true;

      if (emailDone && passwordDone && totpDone && !acc.ready) {
        markReady(blockId, acc.id);
      }
      return { ...m, [acc.id]: nextCopied };
    });
  }, [markReady]);

  const handleAutofillTotp = useCallback(async (accountId) => {
    setAutofillLoading((m) => ({ ...m, [accountId]: true }));
    try {
      const res = await window.nexusAPI?.autofillTotp(accountId);
      const acc = allAccounts.find((a) => a.id === accountId);
      if (res?.ok) {
        showToast(t('accounts.totpAutofillOk', { code: res.code }), 'success');
        if (acc && res.code) {
          await copyField(acc.blockId, acc, 'totp', res.code);
        }
      } else {
        showToast(res?.error || t('accounts.totpAutofillFail'), 'error');
      }
    } finally {
      setAutofillLoading((m) => ({ ...m, [accountId]: false }));
    }
  }, [allAccounts, copyField, showToast, t]);

  const toggleExpand = (accId) => {
    setExpandedReady((m) => ({ ...m, [accId]: !m[accId] }));
  };

  const deleteAccount = async (blockId, accId) => {
    const next = {
      ...data,
      blocks: data.blocks.map((b) => b.id !== blockId ? b : {
        ...b,
        accounts: b.accounts.filter((a) => a.id !== accId),
      }),
    };
    await persist(next);
    setCopiedMap((m) => {
      const copy = { ...m };
      delete copy[accId];
      return copy;
    });
    setExpandedReady((m) => {
      const copy = { ...m };
      delete copy[accId];
      return copy;
    });
  };

  const deleteReady = async () => {
    const next = {
      ...data,
      blocks: data.blocks.map((b) => ({
        ...b,
        accounts: b.accounts.filter((a) => !a.ready),
      })),
    };
    await persist(next);
    showToast(t('accounts.readyDeleted'));
  };

  const handleImport = async () => {
    const parsed = await window.nexusAPI?.parseAccountsImport?.(importText);
    const accounts = parsed?.accounts || [];
    if (!accounts.length) {
      showToast(t('accounts.importEmpty'), 'error');
      return;
    }

    let next;
    if (activeBlockId === 'all' || !data.blocks.find((b) => b.id === activeBlockId)) {
      const block = { id: `block-${Date.now()}`, name: t('accounts.defaultFolder'), accounts };
      next = { ...data, blocks: [...data.blocks, block] };
      setActiveBlockId(block.id);
    } else {
      next = {
        ...data,
        blocks: data.blocks.map((b) => b.id === activeBlockId ? {
          ...b,
          accounts: [...b.accounts, ...accounts],
        } : b),
      };
    }

    await persist(next);
    setImportText('');
    setShowImport(false);
    const skippedMsg = parsed?.skipped ? ` · ${t('accounts.importSkipped', { count: parsed.skipped })}` : '';
    showToast(`${t('accounts.imported', { count: accounts.length })}${skippedMsg}`);
  };

  const handleImportFile = async () => {
    const text = await window.nexusAPI?.importTxt?.();
    if (text) setImportText(text);
  };

  const handleExport = async () => {
    const res = await window.nexusAPI?.exportAccountsCsv?.({
      blockId: activeBlockId !== 'all' ? activeBlockId : undefined,
    });
    if (res?.ok) showToast(t('accounts.exportDone'), 'success');
    else if (!res?.cancelled) showToast(res?.error || t('accounts.exportDone'), 'error');
  };

  const toggleBlockSelect = (blockId, ctrlKey) => {
    if (ctrlKey) {
      setSelectedBlockIds((prev) => (
        prev.includes(blockId) ? prev.filter((id) => id !== blockId) : [...prev, blockId]
      ));
    } else {
      setSelectedBlockIds((prev) => (prev.length === 1 && prev[0] === blockId ? [] : [blockId]));
    }
  };

  const mergeBlocks = async () => {
    if (selectedBlockIds.length < 2) {
      showToast(t('accounts.mergeBlocksMin'), 'error');
      return;
    }
    if (!mergeName.trim()) return;
    const selected = new Set(selectedBlockIds);
    const mergedAccounts = [];
    const remaining = [];
    data.blocks.forEach((b) => {
      if (selected.has(b.id)) mergedAccounts.push(...b.accounts);
      else remaining.push(b);
    });
    const block = { id: `block-${Date.now()}`, name: mergeName.trim(), accounts: mergedAccounts };
    await persist({ ...data, blocks: [...remaining, block] });
    setActiveBlockId(block.id);
    setSelectedBlockIds([]);
    setMergeOpen(false);
    setMergeName('');
    showToast(t('accounts.mergeBlocksDone'));
  };

  const renameBlock = async (blockId) => {
    if (!renameValue.trim()) return;
    const next = {
      ...data,
      blocks: data.blocks.map((b) => b.id === blockId ? { ...b, name: renameValue.trim() } : b),
    };
    await persist(next);
    setRenamingBlockId(null);
    setRenameValue('');
    showToast(t('accounts.blockRenamed'));
  };

  const openLinkedProfile = async (accountId) => {
    const profileId = profileIdForAccount(accountId) || allAccounts.find((a) => a.id === accountId)?.profileId;
    if (!profileId) {
      showToast(t('accounts.openProfileFail'), 'error');
      return;
    }
    const res = await window.nexusAPI?.openProfile?.(String(profileId), browserType);
    if (res?.ok) showToast(t('accounts.profileOpened'), 'success');
    else showToast(res?.error || t('accounts.openProfileFail'), 'error');
  };

  const openFirstLinkedProfile = async () => {
    const withProfile = filtered.find((a) => profileIdForAccount(a.id) || a.profileId);
    if (!withProfile) {
      showToast(t('accounts.openProfileFail'), 'error');
      return;
    }
    await openLinkedProfile(withProfile.id);
  };

  const addFolder = async () => {
    if (!newFolderName.trim()) return;
    const block = { id: `block-${Date.now()}`, name: newFolderName.trim(), accounts: [] };
    await persist({ ...data, blocks: [...data.blocks, block] });
    setActiveBlockId(block.id);
    setNewFolderName('');
    setShowNewFolder(false);
  };

  const readyCount = allAccounts.filter((a) => a.ready).length;
  const bannedCount = allAccounts.filter((a) => a.status === 'banned' || a.status === 'disabled').length;
  const noChannelCount = allAccounts.filter((a) => a.status === 'no_channel').length;

  const runCheck = async () => {
    setChecking(true);
    setCheckProgress(0);
    const opts = {
      ...(activeBlockId !== 'all' ? { blockId: activeBlockId } : {}),
      threads: checkThreads,
    };
    const res = await window.nexusAPI?.checkAccounts(opts);
    setChecking(false);
    if (res?.ok) {
      setData({
        ...res.accounts,
        blocks: (res.accounts?.blocks || []).map((b) => ({
          ...b,
          accounts: (b.accounts || []).map(normalizeAccount),
        })),
      });
      const stats = (res.results || []).reduce((m, r) => {
        m[r.status] = (m[r.status] || 0) + 1;
        return m;
      }, {});
      showToast(t('accounts.checkDone', {
        total: res.results?.length || 0,
        active: stats.active || 0,
        noChannel: stats.no_channel || 0,
        banned: (stats.banned || 0) + (stats.disabled || 0),
      }));
    } else {
      showToast(res?.error || t('accounts.checkFailed'), 'error');
    }
  };

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <PageHeader
        icon={Mail}
        title={t('accounts.googleTitle')}
        description={t('accounts.subtitle', { count: allAccounts.length })}
        actions={(
          <>
          <input
            className="nexus-input text-sm w-48"
            placeholder={t('accounts.searchEmail')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg border text-xs" style={{ borderColor: 'var(--nexus-border)' }} title={t('accounts.checkThreadsHint')}>
            <span className="text-nexus-dim">{t('automation.threads')}</span>
            <button
              type="button"
              disabled={checking}
              onClick={() => setCheckThreads((n) => Math.max(1, n - 1))}
              className="p-1 rounded hover:bg-white/5 disabled:opacity-40"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="w-6 text-center font-mono">{checkThreads}</span>
            <button
              type="button"
              disabled={checking}
              onClick={() => setCheckThreads((n) => Math.min(20, n + 1))}
              className="p-1 rounded hover:bg-white/5 disabled:opacity-40"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
          <button
            type="button"
            onClick={runCheck}
            disabled={checking || allAccounts.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-40 transition"
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {checking ? t('accounts.checking') : t('accounts.checkStatuses')}
          </button>
          {checking && (
            <div className="w-24 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full bg-purple-500 transition-all" style={{ width: `${checkProgress}%` }} />
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 hover:opacity-90 transition shadow-[0_0_20px_rgba(236,72,153,0.25)]"
          >
            <Upload className="w-4 h-4" />
            {t('common.import')}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={allAccounts.length === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border hover:bg-white/5 disabled:opacity-40"
            style={{ borderColor: 'var(--nexus-border)' }}
            title={t('accounts.exportCsv')}
          >
            <Download className="w-4 h-4" />
            {t('accounts.exportCsv')}
          </button>
          {selectedBlockIds.length >= 2 && (
            <button
              type="button"
              onClick={() => setMergeOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border hover:bg-white/5"
              style={{ borderColor: 'var(--nexus-border)' }}
            >
              <GitMerge className="w-4 h-4" />
              {t('accounts.mergeBlocks')} ({selectedBlockIds.length})
            </button>
          )}
          <button
            type="button"
            onClick={openFirstLinkedProfile}
            className="p-2 rounded-lg border hover:bg-white/5 text-nexus-dim"
            style={{ borderColor: 'var(--nexus-border)' }}
            title={t('accounts.openProfile')}
          >
            <User className="w-4 h-4" />
          </button>
          {checking && (
            <button
              type="button"
              onClick={() => setShowCheckLog(true)}
              className="p-2 rounded-lg border hover:bg-white/5 text-nexus-dim"
              style={{ borderColor: 'var(--nexus-border)' }}
              title={t('accounts.checkLog')}
            >
              <FileText className="w-4 h-4" />
            </button>
          )}
          {readyCount > 0 && (
            <button
              type="button"
              onClick={deleteReady}
              className="p-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition"
              title={t('accounts.deleteReady')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          </>
        )}
        className="shrink-0"
      />

      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <select
          className="nexus-input text-xs py-1.5"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
        >
          <option value="all">{t('accounts.allStatuses')}</option>
          {['active', 'no_channel', 'banned', 'disabled', 'logged_out', 'verify', 'no_profile', 'error', 'unknown'].map((s) => (
            <option key={s} value={s}>{t(`accounts.statusLabels.${s}`)}</option>
          ))}
        </select>
        {noChannelCount > 0 && (
          <span className="text-xs text-violet-400">{t('accounts.noChannelCount', { count: noChannelCount })}</span>
        )}
        {bannedCount > 0 && (
          <span className="text-xs text-red-400">{t('accounts.bannedCount', { count: bannedCount })}</span>
        )}
        <button
          type="button"
          onClick={() => { setActiveBlockId('all'); setPage(0); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
            activeBlockId === 'all'
              ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40'
              : 'border border-white/10 text-nexus-dim hover:bg-white/5'
          }`}
        >
          <Folder className="w-3.5 h-3.5" />
          {t('accounts.allFolders')}
        </button>
        {data.blocks.map((block) => {
          const blockSelected = selectedBlockIds.includes(block.id);
          return (
          <div key={block.id} className="flex items-center gap-0.5">
            {renamingBlockId === block.id ? (
              <div className="flex items-center gap-1">
                <input
                  className="nexus-input text-xs w-24 py-1"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && renameBlock(block.id)}
                />
                <button type="button" onClick={() => renameBlock(block.id)} className="px-1.5 py-0.5 text-[10px] rounded bg-pink-500/20 text-pink-300">{t('common.save')}</button>
                <button type="button" onClick={() => setRenamingBlockId(null)} className="p-0.5 text-nexus-dim"><X className="w-3 h-3" /></button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={(e) => { setActiveBlockId(block.id); setPage(0); if (e.ctrlKey || e.metaKey) toggleBlockSelect(block.id, true); }}
                  onContextMenu={(e) => { e.preventDefault(); setRenamingBlockId(block.id); setRenameValue(block.name); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition max-w-[140px] ${
                    activeBlockId === block.id
                      ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40'
                      : blockSelected
                        ? 'bg-violet-500/15 text-violet-300 border border-violet-500/40'
                        : 'border border-white/10 text-nexus-dim hover:bg-white/5'
                  }`}
                >
                  <Folder className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{block.name}</span>
                  <span className="opacity-60">{block.accounts.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setRenamingBlockId(block.id); setRenameValue(block.name); }}
                  className="p-1 rounded hover:bg-white/5 text-nexus-dim"
                  title={t('accounts.renameBlock')}
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
          );
        })}
        {showNewFolder ? (
          <div className="flex items-center gap-1">
            <input
              className="nexus-input text-xs w-28 py-1"
              placeholder={t('accounts.folderName')}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addFolder()}
            />
            <button type="button" onClick={addFolder} className="px-2 py-1 text-xs rounded bg-pink-500/20 text-pink-300 border border-pink-500/30">{t('common.create')}</button>
            <button type="button" onClick={() => setShowNewFolder(false)} className="p-1 text-nexus-dim"><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowNewFolder(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-white/10 text-nexus-dim hover:bg-white/5"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden nexus-card flex flex-col min-h-0">
        {filtered.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-nexus-dim p-8">
            {t('accounts.noAccounts')}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-nexus-card border-b text-nexus-dim text-xs uppercase tracking-wide" style={{ borderColor: 'var(--nexus-border)' }}>
                <tr>
                  <th className="px-3 py-2 text-left w-12">#</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">{t('accounts.password')}</th>
                  <th className="px-3 py-2 text-left">{t('accounts.totp')}</th>
                  <th className="px-3 py-2 text-left">{t('accounts.status')}</th>
                  <th className="px-3 py-2 w-12" />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((acc, i) => (
                  <AccountRow
                    key={acc.id}
                    index={page * PAGE_SIZE + i + 1}
                    account={acc}
                    copied={getCopied(acc.id)}
                    expanded={Boolean(expandedReady[acc.id])}
                    onToggleExpand={() => toggleExpand(acc.id)}
                    onCopyEmail={() => copyField(acc.blockId, acc, 'email', acc.login)}
                    onCopyPassword={() => copyField(acc.blockId, acc, 'password', acc.password)}
                    onCopyTotp={(code) => copyField(acc.blockId, acc, 'totp', code)}
                    profileId={profileIdForAccount(acc.id)}
                    autofillLoading={Boolean(autofillLoading[acc.id])}
                    onAutofillTotp={handleAutofillTotp}
                    onOpenProfile={() => openLinkedProfile(acc.id)}
                    onDelete={() => deleteAccount(acc.blockId, acc.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="shrink-0 flex items-center justify-between px-4 py-2 border-t text-xs text-nexus-dim" style={{ borderColor: 'var(--nexus-border)' }}>
            <span>{t('accounts.pagination', { shown: pageItems.length, total: filtered.length })}</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 rounded border disabled:opacity-30 hover:bg-white/5"
                style={{ borderColor: 'var(--nexus-border)' }}
              >
                {t('accounts.prev')}
              </button>
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded border disabled:opacity-30 hover:bg-white/5"
                style={{ borderColor: 'var(--nexus-border)' }}
              >
                {t('accounts.next')}
              </button>
            </div>
          </div>
        )}
      </div>

      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="nexus-card w-full max-w-lg p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t('accounts.importTitle')}</h2>
              <button type="button" onClick={() => setShowImport(false)} className="text-nexus-dim hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-nexus-dim">{t('accounts.importHint')}</p>
            <textarea
              className="nexus-input w-full h-40 font-mono text-xs"
              placeholder={t('accounts.importPlaceholder')}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div className="flex justify-between gap-2">
              <button type="button" onClick={handleImportFile} className="px-3 py-2 text-sm rounded border hover:bg-white/5" style={{ borderColor: 'var(--nexus-border)' }}>
                {t('accounts.importFromFile')}
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowImport(false)} className="px-4 py-2 text-sm rounded border" style={{ borderColor: 'var(--nexus-border)' }}>{t('common.cancel')}</button>
                <button type="button" onClick={handleImport} className="px-4 py-2 text-sm rounded text-white bg-pink-500 hover:bg-pink-600">{t('common.import')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal open={mergeOpen} onClose={() => setMergeOpen(false)} title={t('accounts.mergeBlocksTitle', { count: selectedBlockIds.length })}>
        <div className="space-y-3">
          <label className="text-xs uppercase text-nexus-dim">{t('accounts.mergeBlocksName')}</label>
          <input
            className="nexus-input w-full"
            value={mergeName}
            onChange={(e) => setMergeName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && mergeBlocks()}
          />
          <button type="button" onClick={mergeBlocks} className="w-full py-2 rounded text-white bg-pink-500 hover:bg-pink-600">
            {t('accounts.mergeBlocks')}
          </button>
        </div>
      </Modal>

      <Modal open={showCheckLog} onClose={() => setShowCheckLog(false)} title={t('accounts.checkLog')} wide>
        <TerminalLog logs={checkLogs} onClear={() => setCheckLogs([])} title={t('accounts.checkLog')} />
      </Modal>
    </div>
  );
}
