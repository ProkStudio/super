import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Key, Play, RefreshCw, Square, ExternalLink } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import PageHeader from '../../layout/PageHeader';
import TerminalLog from '../../ui/TerminalLog';
import TikTokStatusBadge from '../../tiktok/TikTokStatusBadge';

function getProfileName(p) {
  return p.title || p.name || `#${String(p.id || '').slice(0, 8)}`;
}

export default function TikTokAccounts() {
  const { t } = useTranslation();
  const { showToast } = useAppStore();
  const [profiles, setProfiles] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [threads, setThreads] = useState(2);
  const [logs, setLogs] = useState([]);
  const [openingId, setOpeningId] = useState(null);
  const [browserType] = useState('mostlogin');

  const load = useCallback(async () => {
    setLoading(true);
    const [profRes, metaRes] = await Promise.all([
      window.nexusAPI?.listProfiles(browserType),
      window.nexusAPI?.getProfilesMeta?.(),
    ]);
    if (profRes?.ok) setProfiles(profRes.profiles || []);
    else showToast(profRes?.error || t('profiles.mostloginOffline'), 'error');
    if (metaRes) setMeta(metaRes.meta || {});
    setLoading(false);
  }, [browserType, showToast, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!checking) return undefined;
    const unsubLog = window.nexusAPI?.onTiktokDetectLog?.((entry) => {
      setLogs((prev) => [...prev.slice(-399), {
        text: entry.text,
        level: entry.level || 'info',
        ts: Date.now(),
      }]);
    });
    return () => unsubLog?.();
  }, [checking]);

  const enriched = useMemo(() => profiles.map((p) => {
    const m = meta[p.id] || {};
    return {
      ...p,
      tiktokUsername: m.tiktokUsername || '',
      tiktokStatus: m.tiktokStatus || 'none',
      tiktokNotes: m.tiktokNotes || '',
      tiktokReady: !!m.tiktokReady,
    };
  }), [profiles, meta]);

  const toggleAll = () => {
    if (selected.size === enriched.length) setSelected(new Set());
    else setSelected(new Set(enriched.map((p) => p.id)));
  };

  const saveMeta = async (profileId, patch) => {
    await window.nexusAPI?.updateTiktokMeta?.({ profileId, ...patch });
    setMeta((prev) => ({
      ...prev,
      [profileId]: { ...prev[profileId], ...patch },
    }));
  };

  const openProfile = async (profileId) => {
    setOpeningId(profileId);
    try {
      const res = await window.nexusAPI?.openProfile(profileId, browserType);
      if (res?.ok === false) showToast(res.error || t('profiles.startError'), 'error');
      else showToast(t('tiktok.accounts.profileOpened'), 'success');
    } catch (e) {
      showToast(e.message || t('profiles.startError'), 'error');
    } finally {
      setOpeningId(null);
    }
  };

  const runDetect = async () => {
    const ids = [...selected];
    if (!ids.length) {
      showToast(t('tiktok.accounts.selectProfiles'), 'error');
      return;
    }
    setChecking(true);
    setLogs([]);
    try {
      const res = await window.nexusAPI?.detectTiktokLogin?.({ profileIds: ids, threads });
      if (!res?.ok) showToast(res?.error || t('tiktok.accounts.detectFailed'), 'error');
      else {
        showToast(t('tiktok.accounts.detectDone', { count: res.results?.length || ids.length }), 'success');
        await load();
      }
    } catch (e) {
      showToast(e.message || t('tiktok.accounts.detectFailed'), 'error');
    } finally {
      setChecking(false);
    }
  };

  const stopDetect = async () => {
    await window.nexusAPI?.cancelTiktokDetect?.();
    setChecking(false);
  };

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      <PageHeader
        icon={Key}
        title={t('tiktok.accounts.title')}
        description={t('tiktok.accounts.subtitle')}
        actions={(
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-sm hover:bg-white/5"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {t('profiles.refresh')}
            </button>
            {checking ? (
              <button
                type="button"
                onClick={stopDetect}
                className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 text-sm"
              >
                <Square className="w-4 h-4" />
                {t('common.stop')}
              </button>
            ) : (
              <button
                type="button"
                onClick={runDetect}
                className="flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium text-black"
                style={{ background: 'var(--nexus-accent)' }}
              >
                <Play className="w-4 h-4" />
                {t('tiktok.accounts.detectLogin')}
              </button>
            )}
          </div>
        )}
      />

      <div className="nexus-card p-4 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2 text-nexus-dim">
          {t('automation.threads')}
          <input
            type="number"
            min={1}
            max={10}
            value={threads}
            onChange={(e) => setThreads(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
            className="nexus-input w-16 py-1 text-center"
          />
        </label>
        <span className="text-nexus-dim text-xs">{t('tiktok.accounts.hint')}</span>
      </div>

      <div className="nexus-card flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="overflow-auto custom-scrollbar flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10" style={{ background: 'var(--nexus-card)' }}>
              <tr className="text-left text-nexus-dim text-xs border-b" style={{ borderColor: 'var(--nexus-border)' }}>
                <th className="px-3 py-2 w-10">
                  <input
                    type="checkbox"
                    checked={enriched.length > 0 && selected.size === enriched.length}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2">{t('profiles.profileId')}</th>
                <th className="px-3 py-2">@ TikTok</th>
                <th className="px-3 py-2">{t('tiktok.accounts.statusCol')}</th>
                <th className="px-3 py-2">{t('profiles.notes')}</th>
                <th className="px-3 py-2 w-28">{t('tiktok.accounts.ready')}</th>
                <th className="px-3 py-2 w-24" />
              </tr>
            </thead>
            <tbody>
              {enriched.map((p) => (
                <tr
                  key={p.id}
                  className="border-t hover:bg-white/[0.02]"
                  style={{ borderColor: 'var(--nexus-border)' }}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(p.id)) next.delete(p.id);
                          else next.add(p.id);
                          return next;
                        });
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">{getProfileName(p)}</td>
                  <td className="px-3 py-2">
                    <input
                      className="nexus-input text-xs py-1 max-w-[140px]"
                      placeholder="@username"
                      value={p.tiktokUsername}
                      onChange={(e) => saveMeta(p.id, { tiktokUsername: e.target.value.replace(/^@/, '') })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <TikTokStatusBadge status={p.tiktokStatus} />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="nexus-input text-xs py-1 w-full max-w-[180px]"
                      value={p.tiktokNotes}
                      placeholder="—"
                      onChange={(e) => saveMeta(p.id, { tiktokNotes: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={p.tiktokReady}
                      onChange={(e) => saveMeta(p.id, { tiktokReady: e.target.checked })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      title={t('profiles.startProfile')}
                      disabled={openingId === p.id}
                      onClick={() => openProfile(p.id)}
                      className="p-1.5 rounded hover:bg-white/5 text-nexus-dim hover:text-white"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {!enriched.length && !loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-nexus-dim">
                    {t('tiktok.accounts.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(checking || logs.length > 0) && (
        <TerminalLog
          logs={logs.map((l) => ({
            text: l.text,
            time: new Date(l.ts).toLocaleTimeString(),
            error: l.level === 'error',
            success: l.level === 'success',
          }))}
        />
      )}
    </div>
  );
}
