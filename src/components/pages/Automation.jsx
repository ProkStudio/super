import { useState, useEffect, useMemo, useCallback, startTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { Flame, Play, Save, Minus, Plus, QrCode, Settings2, Upload, Square, SlidersHorizontal } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import TerminalLog from '../ui/TerminalLog';
import Toggle from '../ui/Toggle';
import Modal from '../ui/Modal';
import RangeSlider from '../automation/RangeSlider';
import ProfileSelector, { getProfileName } from '../automation/ProfileSelector';
import ChannelSetupPanel, { UploadVideoPanel } from '../automation/ChannelPanels';
import PageHeader from '../layout/PageHeader';

const MODES = [
  { id: 'scan_qr', icon: QrCode },
  { id: 'warmup', icon: Flame },
  { id: 'channel_setup', icon: Settings2 },
  { id: 'upload_video', icon: Upload },
];

const LOG_CAP = 400;

function appendLog(setter, entry) {
  setter((l) => {
    const next = [...l, entry];
    return next.length > LOG_CAP ? next.slice(-LOG_CAP) : next;
  });
}

export default function Automation() {
  const { t } = useTranslation();
  const { showToast } = useAppStore();
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
  const [tagsOpen, setTagsOpen] = useState(false);
  const [fileCounts, setFileCounts] = useState({});
  const [browserType, setBrowserType] = useState('mostlogin');
  const [autoStats, setAutoStats] = useState(null);
  const [aiGenerating, setAiGenerating] = useState(null);
  const [config, setConfig] = useState({
    durationMin: 5,
    durationMax: 15,
    watchMin: 15,
    watchMax: 45,
    likesEnabled: true,
    likeProbability: 30,
    subsEnabled: false,
    subProbability: 15,
    createChannelEnabled: false,
    uniqualizeImages: false,
    tagsEnabled: false,
    tagsMin: 3,
    tagsMax: 10,
    avatarsEnabled: true,
    bannersEnabled: true,
    avatarFolder: '',
    bannerFolder: '',
    avatarFiles: [],
    bannerFiles: [],
    namesEnabled: true,
    descriptionsEnabled: true,
    profileLinkEnabled: false,
    channelNames: '',
    channelDescriptions: '',
    linkTitle: '',
    linkUrls: '',
    namesAiCount: 5,
    descriptionsAiCount: 5,
    videoFolder: '',
    videoFiles: [],
    uploadWarmupEnabled: false,
    uploadManualAssist: true,
    uploadKeepBrowserOnStuck: true,
    uploadManualWaitMs: 0,
    videoTitles: '',
    videoTags: '',
    titlesAiCount: 5,
  });

  const loadProfiles = useCallback(async () => {
    setProfilesLoading(true);
    const [profRes, foldRes] = await Promise.all([
      window.nexusAPI?.listProfiles(browserType),
      window.nexusAPI?.listFolders(browserType),
    ]);
    if (profRes?.ok) setProfiles(profRes.profiles || []);
    if (foldRes?.ok) setFolders(foldRes.folders || []);
    setProfilesLoading(false);
  }, [browserType]);

  useEffect(() => {
    window.nexusAPI?.getSettings().then((r) => {
      if (r?.settings?.browserProvider) setBrowserType(r.settings.browserProvider);
    });
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [browserType, loadProfiles]);

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(async () => {
      const status = await window.nexusAPI?.getAutomationStatus?.();
      if (status) setAutoStats(status.stats);
    }, 2000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    window.nexusAPI?.getAutomationPresets().then(setPresets);
    loadProfiles();

    const unsubLog = window.nexusAPI?.onAutomationLog?.((msg) => {
      const entry = typeof msg === 'string' ? { text: msg } : msg;
      startTransition(() => {
        appendLog(setLogs, {
          time: new Date().toLocaleTimeString(),
          text: entry.text,
          error: entry.level === 'error',
          success: entry.level === 'success',
        });
      });
    });
    const unsubProgress = window.nexusAPI?.onAutomationProgress?.((p) => {
      if (p?.percent != null) setProgress(p.percent);
    });
    return () => {
      unsubLog?.();
      unsubProgress?.();
    };
  }, [loadProfiles]);

  useEffect(() => {
    const updateCounts = async () => {
      const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.jfif', '.heic', '.heif'];
      const videoExts = ['.mp4', '.mov', '.webm', '.mkv', '.avi'];
      const countImages = async (folder, explicitFiles) => {
        if (explicitFiles?.length) return explicitFiles.length;
        if (!folder) return 0;
        const res = await window.nexusAPI?.countFiles({ dir: folder, extensions: imageExts, recursive: true });
        return res?.count ?? 0;
      };
      const countVideos = async (folder, explicitFiles) => {
        if (explicitFiles?.length) return explicitFiles.length;
        if (!folder) return 0;
        const res = await window.nexusAPI?.countFiles({ dir: folder, extensions: videoExts, recursive: true });
        return res?.count ?? 0;
      };
      const [avatar, banner, video] = await Promise.all([
        countImages(config.avatarFolder, config.avatarFiles),
        countImages(config.bannerFolder, config.bannerFiles),
        countVideos(config.videoFolder, config.videoFiles),
      ]);
      setFileCounts({
        avatar: typeof avatar === 'number' ? avatar : avatar?.count ?? 0,
        banner: typeof banner === 'number' ? banner : banner?.count ?? 0,
        video: video?.count ?? 0,
      });
    };
    updateCounts();
  }, [config.avatarFolder, config.bannerFolder, config.videoFolder, config.avatarFiles, config.bannerFiles, config.videoFiles]);

  const splitLines = (text) => (text || '').split('\n').map((s) => s.trim()).filter(Boolean);

  const appendLines = (field, lines) => {
    const existing = splitLines(config[field]);
    const merged = [...existing, ...lines.filter(Boolean)];
    patchConfig({ [field]: merged.join('\n') });
  };

  const runAiGenerate = async (kind) => {
    setAiGenerating(kind);
    try {
      if (kind === 'names') {
        const examples = splitLines(config.channelNames);
        const topic = examples[0] || 'YouTube Shorts';
        const lines = await window.nexusAPI?.generateNames?.({
          topic,
          count: config.namesAiCount || 5,
          examples,
        });
        appendLines('channelNames', Array.isArray(lines) ? lines : splitLines(String(lines)));
      } else if (kind === 'descriptions') {
        const examples = splitLines(config.channelDescriptions);
        const topic = splitLines(config.channelNames)[0] || 'YouTube Shorts';
        const lines = await window.nexusAPI?.generateDescriptions?.({
          topic,
          count: config.descriptionsAiCount || 5,
          examples,
        });
        appendLines('channelDescriptions', Array.isArray(lines) ? lines : splitLines(String(lines)));
      } else if (kind === 'titles') {
        const examples = splitLines(config.videoTitles);
        const lines = await window.nexusAPI?.generateTitles?.({
          count: config.titlesAiCount || 5,
          examples,
        });
        appendLines('videoTitles', Array.isArray(lines) ? lines : splitLines(String(lines)));
      }
      showToast(t('automation.aiDone', { count: config[`${kind === 'titles' ? 'titles' : kind}AiCount`] || 5 }));
    } catch (e) {
      showToast(e?.message || t('automation.aiNoKey'), 'error');
    } finally {
      setAiGenerating(null);
    }
  };

  const stopAutomation = async () => {
    await window.nexusAPI?.cancelAutomation?.();
    setRunning(false);
    setProgress(0);
    showToast(t('automation.stopped'));
  };

  const selectedProfiles = useMemo(
    () => profiles.filter((p) => selectedProfileIds.has(p.id)),
    [profiles, selectedProfileIds],
  );

  const patchConfig = (partial) => setConfig((c) => {
    const next = { ...c, ...partial };
    if (next.durationMin > next.durationMax) next.durationMax = next.durationMin;
    if (next.watchMin > next.watchMax) next.watchMax = next.watchMin;
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
      if (!visibleProfiles.length) return prev;
      const next = new Set(prev);
      if (select) {
        for (const p of visibleProfiles) next.add(p.id);
      } else {
        for (const p of visibleProfiles) next.delete(p.id);
      }
      return next;
    });
  };

  const startDebugStudio = async () => {
    if (!selectedProfiles.length) {
      showToast(t('automation.selectProfiles'), 'error');
      return;
    }
    const profileIds = selectedProfiles.map((p) => String(p.id));
    const accounts = selectedProfiles.map((p) => ({
      profileId: p.id,
      login: getProfileName(p),
      linkedEmail: p.linkedEmail,
    }));
    setRunning(true);
    setProgress(0);
    setLogs([]);
    showToast(t('automation.debugStudioHint'));
    const res = await window.nexusAPI?.debugStudioDom({
      profileIds: profileIds.slice(0, 1),
      waitSeconds: 120,
      config: { accounts, browserType },
    });
    setRunning(false);
    if (res?.ok) showToast(t('automation.debugStudioDone'));
    else showToast(res?.error || t('automation.error'), 'error');
  };

  const start = async () => {
    if (!selectedProfiles.length) {
      showToast(t('automation.selectProfiles'), 'error');
      return;
    }

    const profileIds = selectedProfiles.map((p) => String(p.id));
    const accounts = selectedProfiles.map((p) => ({
      profileId: p.id,
      login: getProfileName(p),
      linkedEmail: p.linkedEmail,
    }));

    setRunning(true);
    setProgress(0);
    setLogs([]);

    const res = await window.nexusAPI?.runAutomation({
      mode,
      profileIds,
      config: {
        ...config,
        threads,
        accounts,
        browserType,
        channelNames: splitLines(config.channelNames),
        channelDescriptions: splitLines(config.channelDescriptions),
        linkUrls: splitLines(config.linkUrls),
        videoTitles: splitLines(config.videoTitles),
        videoTags: splitLines(config.videoTags),
      },
    });

    setRunning(false);
    const sessions = res?.result?.sessions || [];
    if (sessions.length) {
      for (const s of sessions) {
        if (s.warnings?.length) {
          setLogs((l) => [...l, {
            time: new Date().toLocaleTimeString(),
            text: `${s.login || s.profileId}: ${s.warnings.join('; ')}`,
            error: false,
          }]);
        }
        if (s.error) {
          setLogs((l) => [...l, {
            time: new Date().toLocaleTimeString(),
            text: `${s.login || s.profileId}: ${s.error}`,
            error: true,
          }]);
        }
      }
    }
    const resultsBlock = res?.result?.resultsBlock;
    if (resultsBlock?.videos?.length) {
      showToast(t('automation.resultsBlockCreated', { count: resultsBlock.videos.length }));
    }
    if (res?.ok) {
      const failed = sessions.filter((s) => s.error);
      const warned = sessions.filter((s) => s.warnings?.length);
      if (failed.length) {
        showToast(failed.map((s) => s.error).join('; ') || t('automation.error'), 'error');
      } else if (warned.length) {
        showToast(t('automation.completedWithWarnings'), 'warning');
      } else if (!resultsBlock?.videos?.length) {
        showToast(t('automation.completed'));
      }
    } else showToast(res?.error || t('automation.error'), 'error');
  };

  const savePreset = useCallback(async () => {
    const trimmedName = presetName.trim();
    const existingByName = trimmedName ? presets.find((p) => p.name === trimmedName) : null;
    const existingById = activePresetId ? presets.find((p) => p.id === activePresetId) : null;
    const base = existingByName || existingById;

    const preset = {
      id: base?.id || `preset-${Date.now()}`,
      name: trimmedName || base?.name || t('automation.defaultPreset'),
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
  }, [mode, config, threads, selectedProfileIds, presetName, activePresetId, presets, t, showToast]);

  const loadPreset = useCallback((p, closeModal = false) => {
    setMode(p.mode);
    setConfig((prev) => ({ ...prev, ...p.config }));
    setThreads(p.threads || 2);
    if (p.selectedProfileIds?.length) {
      setSelectedProfileIds(new Set(p.selectedProfileIds));
    } else if (p.selectedAccountIds?.length) {
      setSelectedProfileIds(new Set());
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
        title={t('automation.title')}
        description={
          running && autoStats
            ? `${t('automation.subtitle')} · active: ${autoStats.active} · ok: ${autoStats.success} · err: ${autoStats.errors}`
            : t('automation.subtitle')
        }
        className="shrink-0"
        actions={(
          <>
          <select
            className="nexus-input text-sm py-1.5"
            value={browserType}
            onChange={(e) => {
              setBrowserType(e.target.value);
              window.nexusAPI?.updateSettings({ browserProvider: e.target.value });
            }}
          >
            <option value="mostlogin">MostLogin</option>
            <option value="vision">Vision</option>
            <option value="zenno">Zenno</option>
          </select>
          <div className="flex items-center gap-2 text-sm nexus-card px-3 py-1.5 rounded-lg">
            <span className="text-nexus-dim">{t('automation.threads')}</span>
            <button type="button" onClick={() => setThreads(Math.max(1, threads - 1))} className="p-1 rounded hover:bg-white/5"><Minus className="w-3 h-3" /></button>
            <span className="w-6 text-center font-mono">{threads}</span>
            <button type="button" onClick={() => setThreads(threads + 1)} className="p-1 rounded hover:bg-white/5"><Plus className="w-3 h-3" /></button>
          </div>
          <span className="text-sm px-3 py-1.5 rounded-full border border-pink-500/40 text-pink-300 bg-pink-500/10 whitespace-nowrap">
            {t('automation.selected')}: {selectedProfiles.length}
          </span>
          {mode === 'channel_setup' && (
            <button
              type="button"
              onClick={startDebugStudio}
              disabled={running}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border hover:bg-white/5 disabled:opacity-50"
              style={{ borderColor: 'var(--nexus-border)' }}
            >
              {t('automation.debugStudio')}
            </button>
          )}
          <button
            type="button"
            onClick={running ? stopAutomation : start}
            disabled={!running && !selectedProfiles.length}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 shadow-[0_0_20px_rgba(16,185,129,0.25)] ${running ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
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
              mode === id ? 'bg-white/[0.06] text-white border border-white/10' : 'text-nexus-dim hover:text-white hover:bg-white/[0.03]'
            }`}
          >
            <Icon className={`w-4 h-4 ${mode === id && id === 'warmup' ? 'text-pink-500' : ''}`} />
            {t(`automation.modes.${id}`)}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <select className="nexus-input text-sm w-44 py-1.5" defaultValue="" onChange={(e) => { const p = presets.find((x) => x.id === e.target.value); if (p) loadPreset(p); e.target.value = ''; }}>
            <option value="">{t('automation.presetSelect')}</option>
            {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className="nexus-input text-sm w-28 py-1.5 hidden lg:block" placeholder={t('automation.presetName')} value={presetName} onChange={(e) => setPresetName(e.target.value)} />
          <button type="button" onClick={savePreset} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: 'var(--nexus-border)' }}>
            <Save className="w-4 h-4" /> {t('common.save')}
          </button>
          <button
            type="button"
            onClick={() => setShowPresets(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm hover:bg-white/5"
            style={{ borderColor: 'var(--nexus-border)' }}
            title={t('automation.presetManage')}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">{t('automation.presetManage')}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar nexus-card p-5 min-h-0">
        {mode === 'warmup' && (
          <div className="space-y-6 max-w-3xl">
            <h3 className="text-sm font-medium text-white">{t('automation.warmup.title')}</h3>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-nexus-dim mb-3">{t('automation.warmup.duration')}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <RangeSlider label={t('automation.warmup.minTime')} value={config.durationMin} min={3} max={30} suffix="m" onChange={(v) => patchConfig({ durationMin: v })} />
                <RangeSlider label={t('automation.warmup.maxTime')} value={config.durationMax} min={5} max={60} suffix="m" onChange={(v) => patchConfig({ durationMax: v })} />
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-nexus-dim mb-3">{t('automation.warmup.watchOne')}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <RangeSlider label={t('automation.warmup.minSec')} value={config.watchMin} min={5} max={90} suffix="s" onChange={(v) => patchConfig({ watchMin: v })} />
                <RangeSlider label={t('automation.warmup.maxSec')} value={config.watchMax} min={10} max={120} suffix="s" onChange={(v) => patchConfig({ watchMax: v })} />
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-nexus-dim mb-3">{t('automation.warmup.interaction')}</p>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <Toggle checked={config.likesEnabled} onChange={(v) => patchConfig({ likesEnabled: v })} />
                  <span className="text-sm">{t('automation.warmup.likes')}</span>
                </div>
                {config.likesEnabled && (
                  <div className="flex-1 min-w-[200px] max-w-xs">
                    <RangeSlider label="" value={config.likeProbability} min={0} max={100} suffix="%" onChange={(v) => patchConfig({ likeProbability: v })} />
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Toggle checked={config.subsEnabled} onChange={(v) => patchConfig({ subsEnabled: v })} />
                  <span className="text-sm">{t('automation.warmup.subs')}</span>
                </div>
                {config.subsEnabled && (
                  <div className="flex-1 min-w-[200px] max-w-xs">
                    <RangeSlider label={t('automation.warmup.subProbability')} value={config.subProbability} min={0} max={100} suffix="%" onChange={(v) => patchConfig({ subProbability: v })} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {mode === 'channel_setup' && (
          <ChannelSetupPanel config={config} patchConfig={patchConfig} fileCounts={fileCounts} onAiGenerate={runAiGenerate} aiGenerating={aiGenerating} />
        )}
        {mode === 'upload_video' && (
          <UploadVideoPanel config={config} patchConfig={patchConfig} fileCounts={fileCounts} tagsOpen={tagsOpen} setTagsOpen={setTagsOpen} onAiGenerate={runAiGenerate} aiGenerating={aiGenerating} />
        )}
        {mode === 'scan_qr' && <p className="text-nexus-dim text-sm">{t('automation.scanQrDesc')}</p>}
      </div>

      {running && (
        <div className="shrink-0 h-1 rounded bg-zinc-800 overflow-hidden">
          <div className="h-full bg-pink-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      <TerminalLog logs={logs} onClear={() => setLogs([])} title={t('automation.terminal')} clearLabel={t('automation.clear')} />

      <Modal open={showPresets} onClose={() => setShowPresets(false)} title={t('automation.presetManage')}>
        {presets.length === 0 ? (
          <p className="text-sm text-nexus-dim py-6 text-center">{t('automation.presetEmpty')}</p>
        ) : (
          <div className="space-y-1 max-h-[60vh] overflow-y-auto custom-scrollbar -mx-1 px-1">
            {presets.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2.5 border-b" style={{ borderColor: 'var(--nexus-border)' }}>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-nexus-dim">
                    {t(`automation.modes.${p.mode}`)} · {new Date(p.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => loadPreset(p, true)}
                    className="px-3 py-1.5 rounded-lg text-sm hover:bg-white/5 border"
                    style={{ borderColor: 'var(--nexus-border)' }}
                  >
                    {t('automation.presetLoad')}
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePreset(p)}
                    className="px-3 py-1.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 border border-red-500/30"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
