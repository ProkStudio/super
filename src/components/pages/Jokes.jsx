import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sparkles, Play, FolderOpen, Minus, Plus, Image, Type, Music2,
  Terminal, ChevronDown, Trash2,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import PageHeader from '../layout/PageHeader';
import RangeSlider from '../automation/RangeSlider';

const STORAGE_KEY = 'techpro-jokes-settings';
const OVERLAY_KEY = 'techpro-overlay-variants';

const DEFAULT_CONFIG = {
  count: 10,
  duration: 6,
  musicVolume: 30,
  musicChance: 50,
  outputDir: '',
  photosFolder: '',
  fontsFolder: '',
  musicFolder: '',
  customTexts: '',
};

function loadSavedConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG };
}

function FolderField({ label, icon: Icon, value, placeholder, onBrowse }) {
  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {Icon && <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--nexus-accent)' }} />}
        {label}
      </div>
      <div className="flex gap-2">
        <input
          className="nexus-input flex-1 min-w-0 text-xs py-2 font-mono truncate"
          placeholder={placeholder}
          value={value}
          readOnly
        />
        <button
          type="button"
          onClick={onBrowse}
          className="p-2 rounded-lg border border-border hover:bg-accent shrink-0 transition-colors"
        >
          <FolderOpen className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

function CountStepper({ value, onChange, disabled }) {
  return (
    <div className="flex items-center rounded-lg border border-border bg-background overflow-hidden h-10">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(Math.max(1, value - 1))}
        className="px-3 h-full hover:bg-accent text-muted-foreground disabled:opacity-40 transition-colors"
      >
        <Minus className="w-4 h-4" />
      </button>
      <span className="flex-1 text-center text-lg font-semibold font-mono tabular-nums">{value}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(value + 1)}
        className="px-3 h-full hover:bg-accent text-muted-foreground disabled:opacity-40 transition-colors"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function Jokes() {
  const { t } = useTranslation();
  const { showToast, setSettingsSubPage } = useAppStore();
  const [config, setConfig] = useState(loadSavedConfig);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [textVariants, setTextVariants] = useState(() => {
    try {
      const raw = localStorage.getItem(OVERLAY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [overlayAiCount, setOverlayAiCount] = useState(5);
  const [overlayAiLoading, setOverlayAiLoading] = useState(false);

  const persistVariants = (list) => {
    setTextVariants(list);
    try { localStorage.setItem(OVERLAY_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  };

  const patch = (updates) => setConfig((c) => ({ ...c, ...updates }));

  const browseFolder = async (key) => {
    const p = await window.nexusAPI?.openFolder();
    if (p) patch({ [key]: p });
  };

  const persist = useCallback((data) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const unsubProgress = window.nexusAPI?.onJokesProgress?.((p) => {
      if (p?.percent != null) setProgress(p.percent);
      if (p?.message) {
        setLogs((prev) => [...prev, { time: new Date().toLocaleTimeString(), text: p.message }]);
      }
    });
    const unsubLog = window.nexusAPI?.onJokesLog?.((msg) => {
      setLogs((prev) => [...prev, {
        time: new Date().toLocaleTimeString(),
        text: typeof msg === 'string' ? msg : msg?.text,
        error: msg?.level === 'error',
      }]);
    });
    return () => {
      unsubProgress?.();
      unsubLog?.();
    };
  }, []);

  const openReadyFolder = async () => {
    const dir = config.outputDir?.trim();
    if (!dir) {
      showToast(t('jokes.noOutputFolder'), 'error');
      return;
    }
    await window.nexusAPI?.openPath(dir);
  };

  const generate = async () => {
    if (!config.outputDir?.trim()) {
      showToast(t('jokes.outputRequired'), 'error');
      return;
    }
    setRunning(true);
    setProgress(0);
    setLogs([{ time: new Date().toLocaleTimeString(), text: t('jokes.starting') }]);
    persist(config);

    const res = await window.nexusAPI?.generateJokes({
      count: config.count,
      duration: config.duration,
      musicVolume: config.musicVolume,
      musicChance: config.musicChance,
      outputDir: config.outputDir,
      photosFolder: config.photosFolder || undefined,
      fontsFolder: config.fontsFolder || undefined,
      musicFolder: config.musicFolder || undefined,
      jokeTexts: config.customTexts
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      textVariants: textVariants.filter((v) => v.top || v.bottom),
    });

    setRunning(false);
    if (res?.ok) {
      const created = res.result?.count ?? config.count;
      showToast(t('jokes.done', { count: created }));
      setLogs((prev) => [...prev, {
        time: new Date().toLocaleTimeString(),
        text: t('jokes.done', { count: created }),
        success: true,
      }]);
    } else {
      showToast(res?.error || t('jokes.failed'), 'error');
      setLogs((prev) => [...prev, {
        time: new Date().toLocaleTimeString(),
        text: res?.error || t('jokes.failed'),
        error: true,
      }]);
    }
  };

  const removeVariant = (index) => {
    persistVariants(textVariants.filter((_, i) => i !== index));
  };

  const generateOverlayAi = async () => {
    setOverlayAiLoading(true);
    try {
      const pairs = await window.nexusAPI?.generateOverlayPairs?.({
        count: overlayAiCount,
        examples: textVariants.slice(-3),
      });
      if (pairs?.length) {
        persistVariants([...textVariants, ...pairs]);
        showToast(t('jokes.overlayAiDone', { count: pairs.length }));
      }
    } catch (e) {
      showToast(e?.message || t('jokes.overlayAiInvalid'), 'error');
    } finally {
      setOverlayAiLoading(false);
    }
  };

  const headerActions = (
    <>
      <button
        type="button"
        onClick={openReadyFolder}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent transition-colors"
      >
        <FolderOpen className="w-4 h-4" />
        {t('jokes.readyJokes')}
      </button>
      <button
        type="button"
        onClick={generate}
        disabled={running}
        className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
      >
        <Play className="w-4 h-4 fill-current" />
        {running ? t('jokes.generating') : t('jokes.generate')}
      </button>
    </>
  );

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <PageHeader
        icon={Sparkles}
        title={t('jokes.title')}
        description={t('jokes.subtitle')}
        actions={headerActions}
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 min-h-0">
        <div className="rounded-xl border border-border bg-card p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <span className="text-xs text-muted-foreground">{t('jokes.videoCount')}</span>
              <CountStepper
                value={config.count}
                onChange={(v) => patch({ count: v })}
                disabled={running}
              />
            </div>
            <RangeSlider
              label={t('jokes.duration')}
              value={config.duration}
              min={3}
              max={30}
              step={1}
              suffix={t('jokes.secondsShort')}
              onChange={(v) => patch({ duration: v })}
            />
            <RangeSlider
              label={t('jokes.musicVolume')}
              value={config.musicVolume}
              min={0}
              max={100}
              step={5}
              suffix="%"
              onChange={(v) => patch({ musicVolume: v })}
            />
            <RangeSlider
              label={t('jokes.musicChance')}
              value={config.musicChance}
              min={0}
              max={100}
              step={5}
              suffix="%"
              onChange={(v) => patch({ musicChance: v })}
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">{t('jokes.outputFolder')}</span>
            <div className="flex gap-2">
              <input
                className="nexus-input flex-1 text-sm py-2 font-mono truncate"
                placeholder={t('jokes.outputPlaceholder')}
                value={config.outputDir}
                readOnly
              />
              <button
                type="button"
                onClick={() => browseFolder('outputDir')}
                className="p-2 rounded-lg border border-border hover:bg-accent shrink-0 transition-colors"
              >
                <FolderOpen className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FolderField
              label={t('jokes.photosFolder')}
              icon={Image}
              value={config.photosFolder}
              placeholder={t('jokes.photosPlaceholder')}
              onBrowse={() => browseFolder('photosFolder')}
            />
            <FolderField
              label={t('jokes.fontsFolder')}
              icon={Type}
              value={config.fontsFolder}
              placeholder={t('jokes.fontsPlaceholder')}
              onBrowse={() => browseFolder('fontsFolder')}
            />
            <FolderField
              label={t('jokes.musicFolderLabel')}
              icon={Music2}
              value={config.musicFolder}
              placeholder={t('jokes.musicPlaceholder')}
              onBrowse={() => browseFolder('musicFolder')}
            />
          </div>

          {running && progress > 0 && (
            <div className="text-xs font-mono text-right" style={{ color: 'var(--nexus-accent)' }}>
              {progress}%
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <button
            type="button"
            onClick={() => setOverlayOpen((o) => !o)}
            className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-accent/50 transition-colors"
          >
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${overlayOpen ? '' : '-rotate-90'}`} />
            <span className="text-sm font-semibold">{t('jokes.overlayText')}</span>
            <span className="ml-auto text-xs text-muted-foreground">{textVariants.length}</span>
          </button>
          {overlayOpen && (
            <div className="px-5 pb-5 pt-1 border-t border-border space-y-3">
              <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                {textVariants.map((v, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                    <input
                      className="nexus-input text-xs"
                      placeholder={t('jokes.overlayTop')}
                      value={v.top || ''}
                      onChange={(e) => {
                        const next = [...textVariants];
                        next[i] = { ...next[i], top: e.target.value };
                        persistVariants(next);
                      }}
                    />
                    <input
                      className="nexus-input text-xs"
                      placeholder={t('jokes.overlayBottom')}
                      value={v.bottom || ''}
                      onChange={(e) => {
                        const next = [...textVariants];
                        next[i] = { ...next[i], bottom: e.target.value };
                        persistVariants(next);
                      }}
                    />
                    <button
                      type="button"
                      title={t('jokes.overlayRemove')}
                      onClick={() => removeVariant(i)}
                      className="p-1.5 rounded-lg border border-border hover:bg-red-500/10 text-red-400 shrink-0 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => persistVariants([...textVariants, { top: '', bottom: '' }])}
                  className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-accent"
                >
                  {t('jokes.overlayAdd')}
                </button>
                {textVariants.length > 0 && (
                  <button
                    type="button"
                    onClick={() => persistVariants([])}
                    className="px-3 py-1.5 text-xs rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10"
                  >
                    {t('jokes.overlayClearAll')}
                  </button>
                )}
                <input
                  type="number"
                  className="nexus-input w-14 text-xs py-1.5"
                  min={1}
                  value={overlayAiCount}
                  onChange={(e) => setOverlayAiCount(parseInt(e.target.value, 10) || 1)}
                />
                <button
                  type="button"
                  disabled={overlayAiLoading}
                  onClick={generateOverlayAi}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-purple-500/30 text-purple-300 disabled:opacity-50"
                >
                  <Sparkles className="w-3 h-3" />
                  {t('jokes.overlayAi')}
                </button>
                <button
                  type="button"
                  onClick={() => { setSettingsSubPage('apiKeys'); }}
                  className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                >
                  {t('settings.aiProvider')} →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {(running || logs.length > 0) && (
        <div className="shrink-0">
          <div className="rounded-xl border border-border bg-card flex flex-col h-36">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border text-xs shrink-0">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Terminal className="w-3.5 h-3.5" />
                {t('automation.terminal')}
              </span>
              <button
                type="button"
                onClick={() => setLogs([])}
                className="text-muted-foreground hover:text-foreground uppercase tracking-wide text-[10px]"
              >
                {t('automation.clear')}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 font-mono text-xs bg-black/30">
              {logs.map((line, i) => (
                <div key={i} className={line.error ? 'text-red-400' : line.success ? 'text-green-400' : 'text-zinc-300'}>
                  {line.time && <span className="text-muted-foreground">[{line.time}] </span>}
                  {line.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
