import { Minus, Square, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store/useAppStore';

export default function TitleBar({ onSearchClick }) {
  const { t } = useTranslation();
  const { activePage, mostloginOnline } = useAppStore();
  const api = window.nexusAPI;

  return (
    <header className="h-12 shrink-0 flex items-center border-b drag-region" style={{ borderColor: 'var(--nexus-border)' }}>
      <div className="w-[240px] shrink-0 px-4 text-sm font-medium capitalize no-drag">
        {t(`nav.${activePage === 'analytics' ? 'analyticsPage' : activePage}`, { defaultValue: activePage })}
      </div>

      <button
        type="button"
        onClick={onSearchClick}
        className="no-drag flex-1 max-w-md mx-auto flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm text-nexus-dim nexus-card hover:border-purple-500/30 transition"
      >
        <span>{t('search.placeholder')}</span>
        <span className="ml-auto text-xs opacity-60">{t('search.hint')}</span>
      </button>

      <div className="flex items-center gap-3 px-4 no-drag">
        <div className="flex items-center gap-1.5 text-xs text-nexus-dim">
          <span>MostLogin</span>
          <span className={`w-2 h-2 rounded-full ${mostloginOnline ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>
        <button type="button" onClick={() => useAppStore.getState().setHelpOpen(true)} className="w-7 h-7 rounded-full border flex items-center justify-center text-xs hover:bg-white/5" style={{ borderColor: 'var(--nexus-border)' }} title={t('guide.title')}>?</button>
        <button type="button" onClick={() => api?.minimize()} className="p-1 hover:bg-white/10 rounded"><Minus className="w-4 h-4" /></button>
        <button type="button" onClick={() => api?.maximize()} className="p-1 hover:bg-white/10 rounded"><Square className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={() => api?.close()} className="p-1 hover:bg-red-500/20 rounded"><X className="w-4 h-4" /></button>
      </div>
    </header>
  );
}
