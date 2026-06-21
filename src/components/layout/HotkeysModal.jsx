import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore, NAV_ITEMS } from '../../store/useAppStore';

export const HOTKEYS = [
  ...NAV_ITEMS.filter((i) => i.shortcut).map((i) => ({
    label: i.id,
    keys: `Ctrl+${i.shortcut}`,
  })),
  { label: 'search', keys: 'Ctrl+K' },
  { label: 'sidebar', keys: 'Ctrl+B' },
  { label: 'savePreset', keys: 'Ctrl+Shift+S' },
  { label: 'guide', keys: '?' },
];

export function HotkeysList() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-nexus-dim mb-2">{t('hotkeys.navigation')}</div>
        {HOTKEYS.slice(0, 8).map(({ label, keys }) => (
          <div key={label} className="flex justify-between py-1.5 text-sm border-b" style={{ borderColor: 'var(--nexus-border)' }}>
            <span>{t(`nav.${label === 'analytics' ? 'analyticsPage' : label}`, { defaultValue: label })}</span>
            <kbd className="px-2 py-0.5 rounded text-xs bg-white/5">{keys}</kbd>
          </div>
        ))}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-nexus-dim mb-2">{t('hotkeys.general')}</div>
        {HOTKEYS.slice(8).map(({ label, keys }) => (
          <div key={label} className="flex justify-between py-1.5 text-sm border-b" style={{ borderColor: 'var(--nexus-border)' }}>
            <span>{label === 'guide' ? t('nav.guide') : t(`hotkeys.${label}`, { defaultValue: label })}</span>
            <kbd className="px-2 py-0.5 rounded text-xs bg-white/5">{keys}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HotkeysModal() {
  const { t } = useTranslation();
  const { hotkeysOpen, setHotkeysOpen } = useAppStore();

  return (
    <AnimatePresence>
      {hotkeysOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setHotkeysOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md nexus-card p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{t('hotkeys.title')}</h2>
              <button type="button" onClick={() => setHotkeysOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <HotkeysList />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
