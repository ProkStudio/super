import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Gift } from 'lucide-react';
import Modal from '../ui/Modal';
import { getChangelogForVersion } from '../../lib/changelog';
import { useAppStore } from '../../store/useAppStore';

export default function ChangelogModal() {
  const { t } = useTranslation();
  const { setChangelogOpen } = useAppStore();
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState('');
  const [section, setSection] = useState(null);

  const checkAndOpen = useCallback(async () => {
    const status = await window.nexusAPI?.getUpdaterStatus?.();
    const currentVersion = status?.currentVersion || import.meta.env.VITE_APP_VERSION || '2.0.4';
    const dismissed = status?.autoUpdate?.dismissedChangelogVersion;
    const shouldShow = status?.showChangelog ?? dismissed !== currentVersion;

    if (!shouldShow) {
      setChangelogOpen(false);
      return;
    }

    setVersion(currentVersion);
    setSection(getChangelogForVersion(currentVersion));
    setOpen(true);
    setChangelogOpen(true);
  }, [setChangelogOpen]);

  useEffect(() => {
    checkAndOpen();
  }, [checkAndOpen]);

  const handleClose = () => {
    setOpen(false);
    setChangelogOpen(false);
  };

  const handleDismiss = async () => {
    if (version) await window.nexusAPI?.dismissChangelog?.(version);
    handleClose();
  };

  if (!open) return null;

  const items = section?.items?.length ? section.items : [t('changelog.fallback')];

  return (
    <Modal open={open} onClose={handleClose} title={t('changelog.title')} wide>
      <div className="space-y-5">
        <div
          className="relative overflow-hidden rounded-xl border p-5"
          style={{
            borderColor: 'var(--nexus-border)',
            background: 'linear-gradient(135deg, color-mix(in srgb, var(--nexus-accent) 12%, transparent), transparent 60%)',
          }}
        >
          <div
            className="absolute -right-6 -top-6 w-28 h-28 rounded-full opacity-20 blur-2xl pointer-events-none"
            style={{ background: 'var(--nexus-accent)' }}
          />
          <div className="flex items-start gap-4 relative">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg"
              style={{ background: 'color-mix(in srgb, var(--nexus-accent) 22%, transparent)' }}
            >
              <Gift className="w-6 h-6" style={{ color: 'var(--nexus-accent)' }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest text-nexus-dim mb-1">{t('changelog.subtitle')}</p>
              <h2 className="text-xl font-bold tracking-tight">
                {t('changelog.versionLabel', { version })}
              </h2>
              {section?.date && (
                <p className="text-xs text-nexus-dim mt-1">{section.date}</p>
              )}
            </div>
          </div>
        </div>

        <ul className="space-y-3">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex gap-3 text-sm leading-relaxed rounded-lg border px-3 py-2.5"
              style={{ borderColor: 'var(--nexus-border)', background: 'color-mix(in srgb, var(--nexus-card) 80%, transparent)' }}
            >
              <Sparkles className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--nexus-accent)' }} />
              <span dangerouslySetInnerHTML={{ __html: formatItem(item) }} />
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2 pt-2 border-t" style={{ borderColor: 'var(--nexus-border)' }}>
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-black"
            style={{ background: 'var(--nexus-accent)' }}
          >
            {t('changelog.gotIt')}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="px-4 py-2 rounded-lg text-sm border hover:bg-white/5 text-nexus-dim"
            style={{ borderColor: 'var(--nexus-border)' }}
          >
            {t('changelog.dontShowAgain')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function formatItem(text) {
  return text.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-foreground font-medium">$1</strong>');
}
