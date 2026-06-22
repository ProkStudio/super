import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, RefreshCw, Sparkles } from 'lucide-react';
import Modal from '../ui/Modal';
import Toggle from '../ui/Toggle';
import { useAppStore } from '../../store/useAppStore';

const RELEASES_URL = 'https://github.com/ProkStudio/super/releases';

export default function UpdateModal() {
  const { t } = useTranslation();
  const { showToast, updateModalRequest, clearUpdateModalRequest } = useAppStore();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);
  const [phase, setPhase] = useState('available');
  const [progress, setProgress] = useState(0);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const openWithPayload = useCallback((payload) => {
    if (!payload) return;
    setInfo(payload);
    setPhase(payload.status === 'downloaded' ? 'downloaded' : 'available');
    setAutoEnabled(!!payload.autoEnabled);
    setOpen(true);
    setBusy(false);
    if (payload.status === 'downloaded') setProgress(100);
  }, []);

  const applyStatusPayload = useCallback((payload) => {
    if (!payload) return;
    if (payload.status === 'checking') return;

    if (payload.status === 'error') {
      if (payload.manual) {
        showToast(payload.message || t('updater.error'), 'error');
      }
      setBusy(false);
      return;
    }

    if (payload.status === 'not-available') {
      if (payload.manual) showToast(t('updater.upToDate'));
      setBusy(false);
      return;
    }

    if (payload.status === 'downloading') {
      setOpen(true);
      setPhase('downloading');
      setInfo((prev) => ({ ...prev, ...payload }));
      return;
    }

    if (payload.status === 'downloaded') {
      setOpen(true);
      setPhase('downloaded');
      setInfo((prev) => ({ ...prev, ...payload }));
      setBusy(false);
      setProgress(100);
    }

    // status === 'available' — не открываем модалку; тост показывает LaunchExperience
  }, [showToast, t]);

  useEffect(() => {
    if (updateModalRequest) {
      openWithPayload(updateModalRequest);
      clearUpdateModalRequest();
    }
  }, [updateModalRequest, openWithPayload, clearUpdateModalRequest]);

  useEffect(() => {
    window.nexusAPI?.getUpdaterStatus?.().then((res) => {
      if (res?.autoUpdate?.enabled != null) setAutoEnabled(!!res.autoUpdate.enabled);
    });

    const unsubStatus = window.nexusAPI?.onUpdaterStatus?.(applyStatusPayload);
    const unsubNotify = window.nexusAPI?.onUpdaterNotify?.((payload) => {
      if (payload?.status === 'downloaded') {
        openWithPayload(payload);
      }
    });
    const unsubProgress = window.nexusAPI?.onUpdaterProgress?.((p) => {
      if (p?.percent != null) setProgress(Math.round(p.percent));
    });

    return () => {
      unsubStatus?.();
      unsubNotify?.();
      unsubProgress?.();
    };
  }, [applyStatusPayload, openWithPayload]);

  const saveAuto = async (enabled) => {
    setAutoEnabled(enabled);
    await window.nexusAPI?.setAutoUpdateEnabled?.(enabled);
    if (enabled) showToast(t('updater.autoEnabledToast'));
  };

  const handleDownload = async () => {
    setBusy(true);
    setPhase('downloading');
    setProgress(0);
    if (autoEnabled) await window.nexusAPI?.setAutoUpdateEnabled?.(true);
    const res = await window.nexusAPI?.downloadUpdate?.();
    if (res?.ok === false) {
      setBusy(false);
      showToast(res.error || t('updater.error'), 'error');
    }
  };

  const handleInstall = () => {
    window.nexusAPI?.installUpdate?.();
  };

  const handleLater = async () => {
    if (info?.version) await window.nexusAPI?.dismissUpdate?.(info.version);
    setOpen(false);
  };

  const handleOpenReleases = () => {
    window.nexusAPI?.openExternal?.(RELEASES_URL);
  };

  if (!open || !info) return null;

  const versionLabel = info.version || '—';
  const currentLabel = info.currentVersion || '—';

  return (
    <Modal
      open={open}
      onClose={phase === 'downloading' ? () => {} : handleLater}
      title={phase === 'downloaded' ? t('updater.readyTitle') : t('updater.title')}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'color-mix(in srgb, var(--nexus-accent) 18%, transparent)' }}
          >
            <Sparkles className="w-5 h-5" style={{ color: 'var(--nexus-accent)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm leading-relaxed">
              {phase === 'downloaded'
                ? t('updater.readyBody', { version: versionLabel })
                : t('updater.body', { version: versionLabel, current: currentLabel })}
            </p>
            <p className="text-xs text-nexus-dim mt-2">{t('updater.dataSafe')}</p>
          </div>
        </div>

        {info.releaseNotes && phase === 'available' && (
          <div
            className="rounded-lg border p-3 text-xs max-h-32 overflow-y-auto custom-scrollbar whitespace-pre-wrap text-nexus-dim"
            style={{ borderColor: 'var(--nexus-border)' }}
          >
            {info.releaseNotes}
          </div>
        )}

        {phase === 'downloading' && (
          <div>
            <div className="flex justify-between text-xs text-nexus-dim mb-1">
              <span>{t('updater.downloading')}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full transition-all duration-300"
                style={{ width: `${progress}%`, background: 'var(--nexus-accent)' }}
              />
            </div>
          </div>
        )}

        {phase === 'available' && (
          <div
            className="flex items-start gap-3 p-3 rounded-lg border"
            style={{ borderColor: 'var(--nexus-border)' }}
          >
            <Toggle checked={autoEnabled} onChange={saveAuto} />
            <div>
              <p className="text-sm font-medium">{t('updater.autoLabel')}</p>
              <p className="text-xs text-nexus-dim mt-0.5 leading-relaxed">{t('updater.autoHint')}</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {phase === 'available' && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-black disabled:opacity-50"
                style={{ background: 'var(--nexus-accent)' }}
              >
                <Download className="w-4 h-4" />
                {t('updater.download')}
              </button>
              <button
                type="button"
                onClick={handleLater}
                className="px-4 py-2 rounded-lg text-sm border hover:bg-white/5"
                style={{ borderColor: 'var(--nexus-border)' }}
              >
                {t('updater.later')}
              </button>
            </>
          )}

          {phase === 'downloaded' && (
            <button
              type="button"
              onClick={handleInstall}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-black"
              style={{ background: 'var(--nexus-accent)' }}
            >
              <RefreshCw className="w-4 h-4" />
              {t('updater.restart')}
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenReleases}
            className="px-4 py-2 rounded-lg text-sm border hover:bg-white/5 ml-auto"
            style={{ borderColor: 'var(--nexus-border)' }}
          >
            {t('updater.openReleases')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
