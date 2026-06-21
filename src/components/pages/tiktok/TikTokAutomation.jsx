import { useState, useEffect, useMemo, useCallback, startTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { Flame, MessageCircle, Play, Save, Minus, Plus, Square, SlidersHorizontal, BookOpen } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import TerminalLog from '../../ui/TerminalLog';
import Toggle from '../../ui/Toggle';
import Modal from '../../ui/Modal';
import RangeSlider from '../../automation/RangeSlider';
import ProfileSelector from '../../automation/ProfileSelector';
import PageHeader from '../../layout/PageHeader';
import FieldHint from '../../ui/FieldHint';

const MODES = [
  { id: 'warmup', icon: Flame },
  { id: 'smart_comment', icon: MessageCircle },
];

const DEFAULT_WARMUP_CONFIG = {
  durationMin: 3,
  durationMax: 8,
  watchMin: 4,
  watchMax: 20,
  pauseMin: 800,
  pauseMax: 2200,
  likesEnabled: true,
  likeProbability: 25,
  subsEnabled: true,
  subProbability: 5,
  saveEnabled: false,
  saveProbability: 10,
  shareEnabled: false,
  shareProbability: 5,
  sourceMode: 'search_mix',
  searchKeywords: '',
  nicheMixRatio: 30,
};

const DEFAULT_SMART_COMMENT_CONFIG = {
  videoUrlsText: '',
  commentPoolText: '',
  commentPoolMode: 'random',
  commentDateFilterEnabled: true,
  commentMaxAgeDays: 7,
  skipPinned: false,
  skipOwn: true,
  rootCommentEnabled: false,
  useAi: false,
  commentsPerVideo: 20,
  delayMinSec: 7,
  delayMaxSec: 11,
  likeParentEnabled: true,
  likeParentProb: 100,
  likeVideoEnabled: false,
  likeVideoProb: 50,
  followVideoEnabled: false,
  followVideoProb: 20,
  preWarmupEnabled: true,
  preWarmupScrolls: 2,
  keepBrowserOpen: false,
  commentMinLikes: 0,
  commentMaxReplies: 0,
  commentIncludeKeywords: '',
  commentExcludeKeywords: '',
};

function appendLog(setter, entry) {
  setter((l) => {
    const next = [...l, entry];
    return next.length > 400 ? next.slice(-400) : next;
  });
}

export default function TikTokAutomation() {
  const { t } = useTranslation();
  const { showToast, setHelpOpen } = useAppStore();
  const [mode, setMode] = useState('warmup');
  const [threads, setThreads] = useState(2);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  const [presets, setPresets] = useState([]);
  const [presetName, setPresetName] = useState('');
  const [activePresetId, setActivePresetId] = useState(null);
  const [showPresets, setShowPresets] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [selectedProfileIds, setSelectedProfileIds] = useState(() => new Set());
  const [browserType] = useState('mostlogin');
  const [config, setConfig] = useState({ ...DEFAULT_WARMUP_CONFIG, ...DEFAULT_SMART_COMMENT_CONFIG });

  const tiktokPresets = useMemo(
    () => presets.filter((p) => p.module === 'tiktok' && (!p.mode || p.mode === mode)),
    [presets, mode],
  );

  const loadProfiles = useCallback(async () => {
    setProfilesLoading(true);
    const [profRes, foldRes, metaRes] = await Promise.all([
      window.nexusAPI?.listProfiles(browserType),
      window.nexusAPI?.listFolders(browserType),
      window.nexusAPI?.getProfilesMeta?.(),
    ]);
    if (profRes?.ok) {
      const meta = metaRes?.meta || {};
      setProfiles((profRes.profiles || []).map((p) => ({
        ...p,
        tiktokUsername: meta[p.id]?.tiktokUsername,
        tiktokReady: meta[p.id]?.tiktokReady,
        localStatus: meta[p.id]?.tiktokReady ? 'ready' : (meta[p.id]?.tiktokStatus || 'none'),
      })));
    }
    if (foldRes?.ok) setFolders(foldRes.folders || []);
    setProfilesLoading(false);
  }, [browserType]);

  useEffect(() => {
    loadProfiles();
    window.nexusAPI?.getAutomationPresets().then(setPresets);

    const unsubLog = window.nexusAPI?.onTiktokAutomationLog?.((msg) => {
      const entry = typeof msg === 'string' ? { text: msg } : msg;
      startTransition(() => {
        appendLog(setLogs, {
          time: entry.time || new Date().toLocaleTimeString(),
          text: entry.text,
          error: entry.level === 'error',
          success: entry.level === 'success',
        });
      });
    });
    const unsubProgress = window.nexusAPI?.onTiktokAutomationProgress?.((p) => {
      if (p?.percent != null) setProgress(p.percent);
    });
    return () => {
      unsubLog?.();
      unsubProgress?.();
    };
  }, [loadProfiles]);

  const selectedProfiles = useMemo(
    () => profiles.filter((p) => selectedProfileIds.has(p.id)),
    [profiles, selectedProfileIds],
  );

  const patchConfig = (partial) => setConfig((c) => {
    const next = { ...c, ...partial };
    if (next.durationMin > next.durationMax) next.durationMax = next.durationMin;
    if (next.watchMin > next.watchMax) next.watchMax = next.watchMin;
    if (next.pauseMin > next.pauseMax) next.pauseMax = next.pauseMin;
    if (next.delayMinSec > next.delayMaxSec) next.delayMaxSec = next.delayMinSec;
    return next;
  });

  const toggleProfile = (id) => {
    setSelectedProfileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = (visibleProfiles, select) => {
    setSelectedProfileIds((prev) => {
      const next = new Set(prev);
      for (const p of visibleProfiles) {
        if (select) next.add(p.id);
        else next.delete(p.id);
      }
      return next;
    });
  };

  const stopAutomation = async () => {
    await window.nexusAPI?.stopTiktokAutomation?.();
    setRunning(false);
    setProgress(0);
    showToast(t('automation.stopped'));
  };

  const start = async () => {
    if (!selectedProfiles.length) {
      showToast(t('automation.selectProfiles'), 'error');
      return;
    }

    const profileIds = selectedProfiles.map((p) => String(p.id));
    setRunning(true);
    setProgress(0);
    setLogs([]);

    let runConfig;
    if (mode === 'warmup') {
      const keywords = (config.searchKeywords || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      runConfig = {
        ...config,
        threads,
        searchKeywords: keywords,
        browserType,
      };
    } else {
      const videoUrls = (config.videoUrlsText || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const commentPool = (config.commentPoolText || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!videoUrls.length) {
        showToast(t('tiktok.automation.needVideoUrls'), 'error');
        setRunning(false);
        return;
      }
      if (!commentPool.length && !config.useAi) {
        showToast(t('tiktok.automation.needCommentPool'), 'error');
        setRunning(false);
        return;
      }
      runConfig = {
        ...config,
        threads,
        videoUrls,
        commentPool,
        commentIncludeKeywords: (config.commentIncludeKeywords || '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        commentExcludeKeywords: (config.commentExcludeKeywords || '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        browserType,
      };
    }

    const res = await window.nexusAPI?.runTiktokAutomation?.({
      mode,
      profileIds,
      threads,
      config: runConfig,
    });

    setRunning(false);
    setProgress(100);

    const sessions = res?.sessions || res?.results || [];
    if (res?.ok) {
      const failed = sessions.filter((s) => s.error);
      if (failed.length) {
        showToast(failed.map((s) => s.error).join('; ') || t('automation.error'), 'error');
      } else {
        showToast(mode === 'warmup' ? t('tiktok.automation.warmupDone') : t('tiktok.automation.smartCommentDone'));
      }
    } else {
      showToast(res?.error || t('automation.error'), 'error');
    }
  };

  const savePreset = useCallback(async () => {
    const trimmedName = presetName.trim();
    const existingByName = trimmedName ? tiktokPresets.find((p) => p.name === trimmedName) : null;
    const existingById = activePresetId ? tiktokPresets.find((p) => p.id === activePresetId) : null;
    const base = existingByName || existingById;

    const preset = {
      id: base?.id || `tt-preset-${Date.now()}`,
      name: trimmedName || base?.name || t('tiktok.automation.defaultPreset'),
      module: 'tiktok',
      mode,
      config,
      threads,
      selectedProfileIds: [...selectedProfileIds],
      createdAt: base?.createdAt || new Date().toISOString(),
    };
    const list = await window.nexusAPI?.saveAutomationPreset(preset);
    setPresets(list || []);
    setActivePresetId(preset.id);
    setPresetName(preset.name);
    showToast(t('automation.presetSaved'));
  }, [config, threads, selectedProfileIds, presetName, activePresetId, tiktokPresets, t, showToast, mode]);

  const loadPreset = useCallback((p, closeModal = false) => {
    if (p.mode) setMode(p.mode);
    setConfig((prev) => ({ ...prev, ...p.config }));
    setThreads(p.threads || 2);
    if (p.selectedProfileIds?.length) {
      setSelectedProfileIds(new Set(p.selectedProfileIds));
    }
    setActivePresetId(p.id);
    setPresetName(p.name || '');
    showToast(t('automation.presetLoaded'));
    if (closeModal) setShowPresets(false);
  }, [t, showToast]);

  const deletePreset = useCallback(async (p) => {
    if (!window.confirm(t('automation.presetDeleteConfirm', { name: p.name }))) return;
    const list = await window.nexusAPI?.deleteAutomationPreset(p.id);
    setPresets(list || []);
    if (activePresetId === p.id) {
      setActivePresetId(null);
      setPresetName('');
    }
    showToast(t('automation.presetDeleted'));
  }, [activePresetId, t, showToast]);

  useEffect(() => {
    const onQuickSave = () => { savePreset(); };
    window.addEventListener('techpro-save-automation-preset', onQuickSave);
    return () => window.removeEventListener('techpro-save-automation-preset', onQuickSave);
  }, [savePreset]);

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      <PageHeader
        icon={Flame}
        title={t('tiktok.automation.title')}
        description={t('tiktok.automation.subtitle')}
        className="shrink-0"
        actions={(
          <>
            <div className="flex items-center gap-2 text-sm nexus-card px-3 py-1.5 rounded-lg">
              <span className="text-nexus-dim">{t('automation.threads')}</span>
              <button type="button" onClick={() => setThreads(Math.max(1, threads - 1))} className="p-1 rounded hover:bg-white/5"><Minus className="w-3 h-3" /></button>
              <span className="w-6 text-center font-mono">{threads}</span>
              <button type="button" onClick={() => setThreads(Math.min(10, threads + 1))} className="p-1 rounded hover:bg-white/5"><Plus className="w-3 h-3" /></button>
            </div>
            <span className="text-sm px-3 py-1.5 rounded-full border whitespace-nowrap" style={{ borderColor: 'color-mix(in srgb, var(--nexus-accent) 40%, transparent)', color: 'var(--nexus-accent)' }}>
              {t('automation.selected')}: {selectedProfiles.length}
            </span>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border hover:bg-white/5"
              style={{ borderColor: 'var(--nexus-border)' }}
              title={t('guide.title')}
            >
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">{t('guide.title')}</span>
            </button>
            <button
              type="button"
              onClick={running ? stopAutomation : start}
              disabled={!running && !selectedProfiles.length}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 ${
                running ? 'bg-red-600 hover:bg-red-500 text-white' : 'text-black'
              }`}
              style={running ? {} : { background: 'var(--nexus-accent)' }}
            >
              {running ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              {running ? t('common.stop') : t('common.start')}
            </button>
          </>
        )}
      />

      <ProfileSelector
        profiles={profiles}
        folders={folders}
        selectedIds={selectedProfileIds}
        onToggle={toggleProfile}
        onToggleAll={toggleAllVisible}
        onRefresh={loadProfiles}
        loading={profilesLoading}
      />

      <div className="flex items-center gap-1 shrink-0 flex-wrap border-b pb-2" style={{ borderColor: 'var(--nexus-border)' }}>
        {MODES.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition ${
              mode === id ? 'text-white border border-white/10 bg-white/[0.06]' : 'text-nexus-dim hover:text-white hover:bg-white/[0.03]'
            }`}
          >
            <Icon className="w-4 h-4" style={mode === id ? { color: 'var(--nexus-accent)' } : {}} />
            {t(`tiktok.automation.modes.${id}`)}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <select className="nexus-input text-sm w-44 py-1.5" defaultValue="" onChange={(e) => { const p = tiktokPresets.find((x) => x.id === e.target.value); if (p) loadPreset(p); e.target.value = ''; }}>
            <option value="">{t('automation.presetSelect')}</option>
            {tiktokPresets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className="nexus-input text-sm w-28 py-1.5 hidden lg:block" placeholder={t('automation.presetName')} value={presetName} onChange={(e) => setPresetName(e.target.value)} />
          <button type="button" onClick={savePreset} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: 'var(--nexus-border)' }}>
            <Save className="w-4 h-4" /> {t('common.save')}
          </button>
          <button type="button" onClick={() => setShowPresets(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: 'var(--nexus-border)' }}>
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar nexus-card p-5 min-h-0">
        {mode === 'warmup' && (
          <div className="space-y-6 max-w-3xl">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-nexus-dim mb-3">{t('tiktok.automation.warmup.source')}</p>
              <select
                className="nexus-input text-sm max-w-md"
                value={config.sourceMode}
                onChange={(e) => patchConfig({ sourceMode: e.target.value })}
              >
                <option value="fyp_only">{t('tiktok.automation.warmup.sourceFyp')}</option>
                <option value="search_mix">{t('tiktok.automation.warmup.sourceMix')}</option>
                <option value="search_only">{t('tiktok.automation.warmup.sourceSearch')}</option>
              </select>
              {config.sourceMode !== 'fyp_only' && (
                <div className="mt-3 space-y-3">
                  <textarea
                    className="nexus-input text-sm min-h-[80px] font-mono"
                    placeholder={t('tiktok.automation.warmup.keywordsPlaceholder')}
                    value={config.searchKeywords}
                    onChange={(e) => patchConfig({ searchKeywords: e.target.value })}
                  />
                  {config.sourceMode === 'search_mix' && (
                    <RangeSlider
                      label={t('tiktok.automation.warmup.mixRatio')}
                      value={config.nicheMixRatio}
                      min={5}
                      max={80}
                      suffix="%"
                      onChange={(v) => patchConfig({ nicheMixRatio: v })}
                    />
                  )}
                </div>
              )}
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-nexus-dim mb-3">{t('automation.warmup.duration')}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <RangeSlider label={t('automation.warmup.minTime')} value={config.durationMin} min={1} max={30} suffix="m" onChange={(v) => patchConfig({ durationMin: v })} />
                <RangeSlider label={t('automation.warmup.maxTime')} value={config.durationMax} min={3} max={60} suffix="m" onChange={(v) => patchConfig({ durationMax: v })} />
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-nexus-dim mb-3">{t('automation.warmup.watchOne')}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <RangeSlider label={t('automation.warmup.minSec')} value={config.watchMin} min={3} max={60} suffix="s" onChange={(v) => patchConfig({ watchMin: v })} />
                <RangeSlider label={t('automation.warmup.maxSec')} value={config.watchMax} min={5} max={120} suffix="s" onChange={(v) => patchConfig({ watchMax: v })} />
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-nexus-dim mb-3">{t('tiktok.automation.warmup.pauseBetween')}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <RangeSlider label={t('tiktok.automation.warmup.pauseMin')} value={config.pauseMin} min={200} max={5000} suffix="ms" onChange={(v) => patchConfig({ pauseMin: v })} />
                <RangeSlider label={t('tiktok.automation.warmup.pauseMax')} value={config.pauseMax} min={500} max={8000} suffix="ms" onChange={(v) => patchConfig({ pauseMax: v })} />
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-nexus-dim mb-3">{t('automation.warmup.interaction')}</p>
              <div className="space-y-4">
                {[
                  { key: 'likes', enabled: 'likesEnabled', prob: 'likeProbability' },
                  { key: 'subs', enabled: 'subsEnabled', prob: 'subProbability' },
                  { key: 'save', enabled: 'saveEnabled', prob: 'saveProbability' },
                  { key: 'share', enabled: 'shareEnabled', prob: 'shareProbability' },
                ].map(({ key, enabled, prob }) => (
                  <div key={key} className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-[120px]">
                      <Toggle checked={config[enabled]} onChange={(v) => patchConfig({ [enabled]: v })} />
                      <span className="text-sm">{t(`tiktok.automation.warmup.${key}`)}</span>
                    </div>
                    {config[enabled] && (
                      <div className="flex-1 min-w-[200px] max-w-xs">
                        <RangeSlider label="" value={config[prob]} min={0} max={100} suffix="%" onChange={(v) => patchConfig({ [prob]: v })} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {mode === 'smart_comment' && (
          <div className="space-y-6 max-w-3xl">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-nexus-dim mb-2">
                <FieldHint label={t('tiktok.automation.comment.videos')} text={t('tiktok.automation.comment.videosHint')} />
              </p>
              <textarea
                className="nexus-input text-sm min-h-[100px] font-mono w-full"
                placeholder={t('tiktok.automation.comment.videosPlaceholder')}
                value={config.videoUrlsText}
                onChange={(e) => patchConfig({ videoUrlsText: e.target.value })}
              />
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-nexus-dim mb-2">
                <FieldHint label={t('tiktok.automation.comment.pool')} text={t('tiktok.automation.comment.poolHint')} />
              </p>
              <textarea
                className="nexus-input text-sm min-h-[160px] font-mono w-full"
                placeholder={t('tiktok.automation.comment.poolPlaceholder')}
                value={config.commentPoolText}
                onChange={(e) => patchConfig({ commentPoolText: e.target.value })}
              />
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <span className="text-sm text-nexus-dim">{t('tiktok.automation.comment.poolMode')}</span>
                <select
                  className="nexus-input text-sm max-w-xs"
                  value={config.commentPoolMode}
                  onChange={(e) => patchConfig({ commentPoolMode: e.target.value })}
                >
                  <option value="random">{t('tiktok.automation.comment.poolRandom')}</option>
                  <option value="sequential">{t('tiktok.automation.comment.poolSequential')}</option>
                  <option value="spintax">{t('tiktok.automation.comment.poolSpintax')}</option>
                  <option value="weighted">{t('tiktok.automation.comment.poolWeighted')}</option>
                </select>
                <div className="flex items-center gap-2">
                  <Toggle checked={config.useAi} onChange={(v) => patchConfig({ useAi: v })} />
                  <span className="text-sm">{t('tiktok.automation.comment.useAi')}</span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-nexus-dim mb-2">
                <FieldHint label={t('tiktok.automation.comment.strategy')} text={t('tiktok.automation.comment.strategyHint')} />
              </p>
              <p className="text-xs text-[var(--text-muted)] mb-4 leading-relaxed">{t('tiktok.automation.comment.scrollBehavior')}</p>
              <div className="space-y-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-[200px]">
                    <Toggle
                      checked={config.commentDateFilterEnabled !== false}
                      onChange={(v) => patchConfig({ commentDateFilterEnabled: v })}
                    />
                    <FieldHint text={t('tiktok.automation.comment.commentDateFilterHint')}>
                      <span className="text-sm">{t('tiktok.automation.comment.commentDateFilter')}</span>
                    </FieldHint>
                  </div>
                  {config.commentDateFilterEnabled !== false && (
                    <div className="flex-1 min-w-[200px] max-w-xs">
                      <RangeSlider
                        label={t('tiktok.automation.comment.commentMaxAgeDays')}
                        value={config.commentMaxAgeDays ?? 7}
                        min={1}
                        max={90}
                        suffix=" дн"
                        onChange={(v) => patchConfig({ commentMaxAgeDays: v })}
                      />
                    </div>
                  )}
                </div>
                {config.commentDateFilterEnabled !== false && (
                  <p className="text-xs text-[var(--text-muted)] -mt-2">{t('tiktok.automation.comment.commentMaxAgeHint')}</p>
                )}
                <div className="flex flex-wrap gap-6">
                  <div className="flex items-center gap-2">
                    <Toggle checked={config.skipPinned} onChange={(v) => patchConfig({ skipPinned: v })} />
                    <FieldHint text={t('tiktok.automation.comment.skipPinnedHint')}>
                      <span className="text-sm">{t('tiktok.automation.comment.skipPinned')}</span>
                    </FieldHint>
                  </div>
                  <div className="flex items-center gap-2">
                    <Toggle checked={config.skipOwn} onChange={(v) => patchConfig({ skipOwn: v })} />
                    <FieldHint text={t('tiktok.automation.comment.skipOwnHint')}>
                      <span className="text-sm">{t('tiktok.automation.comment.skipOwn')}</span>
                    </FieldHint>
                  </div>
                  <div className="flex items-center gap-2">
                    <Toggle checked={config.rootCommentEnabled} onChange={(v) => patchConfig({ rootCommentEnabled: v })} />
                    <FieldHint text={t('tiktok.automation.comment.rootCommentHint')}>
                      <span className="text-sm">{t('tiktok.automation.comment.rootComment')}</span>
                    </FieldHint>
                  </div>
                  <div className="flex items-center gap-2">
                    <Toggle checked={config.preWarmupEnabled !== false} onChange={(v) => patchConfig({ preWarmupEnabled: v })} />
                    <FieldHint text={t('tiktok.automation.comment.preWarmupHint')}>
                      <span className="text-sm">{t('tiktok.automation.comment.preWarmup')}</span>
                    </FieldHint>
                  </div>
                  <div className="flex items-center gap-2">
                    <Toggle checked={!!config.keepBrowserOpen} onChange={(v) => patchConfig({ keepBrowserOpen: v })} />
                    <FieldHint text={t('tiktok.automation.comment.keepBrowserOpenHint')}>
                      <span className="text-sm">{t('tiktok.automation.comment.keepBrowserOpen')}</span>
                    </FieldHint>
                  </div>
                </div>
                {config.preWarmupEnabled !== false && (
                  <div className="max-w-xs">
                    <RangeSlider
                      label={t('tiktok.automation.comment.preWarmupScrolls')}
                      value={config.preWarmupScrolls ?? 2}
                      min={1}
                      max={6}
                      onChange={(v) => patchConfig({ preWarmupScrolls: v })}
                    />
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <RangeSlider
                    label={t('tiktok.automation.comment.commentMinLikes')}
                    value={config.commentMinLikes ?? 0}
                    min={0}
                    max={500}
                    onChange={(v) => patchConfig({ commentMinLikes: v })}
                  />
                  <RangeSlider
                    label={t('tiktok.automation.comment.commentMaxReplies')}
                    value={config.commentMaxReplies ?? 0}
                    min={0}
                    max={200}
                    onChange={(v) => patchConfig({ commentMaxReplies: v })}
                  />
                </div>
                <p className="text-xs text-[var(--text-muted)]">{t('tiktok.automation.comment.likesRepliesHint')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-nexus-dim mb-2">
                      <FieldHint label={t('tiktok.automation.comment.includeKeywords')} text={t('tiktok.automation.comment.includeKeywordsHint')} />
                    </p>
                    <textarea
                      className="nexus-input text-sm min-h-[72px] font-mono w-full"
                      placeholder={t('tiktok.automation.comment.keywordsPlaceholder')}
                      value={config.commentIncludeKeywords}
                      onChange={(e) => patchConfig({ commentIncludeKeywords: e.target.value })}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-nexus-dim mb-2">
                      <FieldHint label={t('tiktok.automation.comment.excludeKeywords')} text={t('tiktok.automation.comment.excludeKeywordsHint')} />
                    </p>
                    <textarea
                      className="nexus-input text-sm min-h-[72px] font-mono w-full"
                      placeholder={t('tiktok.automation.comment.keywordsPlaceholder')}
                      value={config.commentExcludeKeywords}
                      onChange={(e) => patchConfig({ commentExcludeKeywords: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-nexus-dim mb-3">{t('tiktok.automation.comment.limits')}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <RangeSlider
                  label={t('tiktok.automation.comment.commentsPerVideo')}
                  value={config.commentsPerVideo}
                  min={1}
                  max={100}
                  onChange={(v) => patchConfig({ commentsPerVideo: v })}
                />
                <RangeSlider
                  label={t('tiktok.automation.comment.delayMin')}
                  value={config.delayMinSec}
                  min={5}
                  max={120}
                  suffix="s"
                  onChange={(v) => patchConfig({ delayMinSec: v })}
                />
                <RangeSlider
                  label={t('tiktok.automation.comment.delayMax')}
                  value={config.delayMaxSec}
                  min={10}
                  max={300}
                  suffix="s"
                  onChange={(v) => patchConfig({ delayMaxSec: v })}
                />
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-nexus-dim mb-3">{t('automation.warmup.interaction')}</p>
              <div className="space-y-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-[200px]">
                    <Toggle checked={config.likeParentEnabled} onChange={(v) => patchConfig({ likeParentEnabled: v })} />
                    <span className="text-sm">{t('tiktok.automation.comment.likeParent')}</span>
                  </div>
                  {config.likeParentEnabled && (
                    <div className="flex-1 min-w-[200px] max-w-xs">
                      <RangeSlider label="" value={config.likeParentProb} min={0} max={100} suffix="%" onChange={(v) => patchConfig({ likeParentProb: v })} />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-[200px]">
                    <Toggle checked={config.likeVideoEnabled} onChange={(v) => patchConfig({ likeVideoEnabled: v })} />
                    <span className="text-sm">{t('tiktok.automation.comment.likeVideo')}</span>
                  </div>
                  {config.likeVideoEnabled && (
                    <div className="flex-1 min-w-[200px] max-w-xs">
                      <RangeSlider label="" value={config.likeVideoProb} min={0} max={100} suffix="%" onChange={(v) => patchConfig({ likeVideoProb: v })} />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-[200px]">
                    <Toggle checked={config.followVideoEnabled} onChange={(v) => patchConfig({ followVideoEnabled: v })} />
                    <span className="text-sm">{t('tiktok.automation.comment.followVideo')}</span>
                  </div>
                  {config.followVideoEnabled && (
                    <div className="flex-1 min-w-[200px] max-w-xs">
                      <RangeSlider label="" value={config.followVideoProb} min={0} max={100} suffix="%" onChange={(v) => patchConfig({ followVideoProb: v })} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {running && (
        <div className="shrink-0 h-1 rounded bg-zinc-800 overflow-hidden">
          <div className="h-full transition-all" style={{ width: `${progress}%`, background: 'var(--nexus-accent)' }} />
        </div>
      )}

      <TerminalLog logs={logs} onClear={() => setLogs([])} title={t('automation.terminal')} clearLabel={t('automation.clear')} />

      <Modal open={showPresets} onClose={() => setShowPresets(false)} title={t('automation.presetManage')}>
        {tiktokPresets.length === 0 ? (
          <p className="text-sm text-nexus-dim py-6 text-center">{t('automation.presetEmpty')}</p>
        ) : (
          <div className="space-y-1 max-h-[60vh] overflow-y-auto custom-scrollbar -mx-1 px-1">
            {tiktokPresets.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2.5 border-b" style={{ borderColor: 'var(--nexus-border)' }}>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-nexus-dim">{new Date(p.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => loadPreset(p, true)} className="text-xs px-2 py-1 rounded border hover:bg-white/5">{t('automation.presetLoad')}</button>
                  <button type="button" onClick={() => deletePreset(p)} className="text-xs px-2 py-1 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10">{t('common.delete')}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
