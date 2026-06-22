import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Download, X, ArrowUpCircle } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export default function UpdateToast() {
  const { t } = useTranslation();
  const { updateBanner, clearUpdateBanner, requestUpdateModal } = useAppStore();

  if (!updateBanner) return null;

  const { version, currentVersion } = updateBanner;

  const handleUpdate = () => {
    requestUpdateModal(updateBanner);
  };

  const handleDismiss = async () => {
    if (version) await window.nexusAPI?.dismissUpdate?.(version);
    clearUpdateBanner();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 24, y: -12 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        exit={{ opacity: 0, x: 24 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        className="fixed top-4 right-4 z-[70] w-[min(100vw-2rem,22rem)] rounded-xl border shadow-2xl overflow-hidden relative"
        style={{
          background: 'var(--nexus-card)',
          borderColor: 'var(--nexus-border)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        }}
      >
        <div
          className="h-1 w-full"
          style={{ background: 'linear-gradient(90deg, var(--nexus-accent), color-mix(in srgb, var(--nexus-accent) 40%, #fff))' }}
        />
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'color-mix(in srgb, var(--nexus-accent) 18%, transparent)' }}
            >
              <ArrowUpCircle className="w-5 h-5" style={{ color: 'var(--nexus-accent)' }} />
            </div>
            <div className="flex-1 min-w-0 pr-6">
              <p className="text-sm font-semibold leading-snug">{t('updater.toastTitle')}</p>
              <p className="text-xs text-nexus-dim mt-1 leading-relaxed">
                {t('updater.toastBody', { version, current: currentVersion || '—' })}
              </p>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="absolute top-3 right-3 p-1 rounded-md hover:bg-white/5 text-nexus-dim"
              aria-label={t('common.close')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={handleUpdate}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-black"
              style={{ background: 'var(--nexus-accent)' }}
            >
              <Download className="w-3.5 h-3.5" />
              {t('updater.toastAction')}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="px-3 py-2 rounded-lg text-xs border hover:bg-white/5"
              style={{ borderColor: 'var(--nexus-border)' }}
            >
              {t('updater.later')}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
