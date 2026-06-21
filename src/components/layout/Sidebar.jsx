import { motion } from 'framer-motion';
import {
  Users, Key, Zap, ListChecks, Sparkles, Wand2, BarChart3, LineChart,
  Shield, Settings, ChevronLeft, Globe, Sun, Moon, BookOpen,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useAppStore, useNavItems } from '../../store/useAppStore';
import i18n from '../../i18n';
import { getPresetById, getPresetColors, normalizeSettings } from '../../constants/themePresets';
import { settingsToPersist } from '../../lib/theme';

const ICONS = {
  profiles: Users, accounts: Key, automation: Zap, tasks: ListChecks,
  jokes: Sparkles, uniqueizer: Wand2, results: BarChart3, analytics: LineChart,
  cabinet: Shield, settings: Settings, guide: BookOpen,
};

function StatusDot({ ok, label }) {
  return (
    <div className="flex items-center gap-1 text-[10px] text-nexus-dim">
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      {label}
    </div>
  );
}

export default function Sidebar() {
  const { t } = useTranslation();
  const navItems = useNavItems();
  const {
    activePage, sidebarCollapsed, setActivePage, toggleSidebar,
    theme, locale, applyTheme, setHelpOpen,
  } = useAppStore();
  const [sys, setSys] = useState({ python: false, ffmpeg: false, playwright: false });

  useEffect(() => {
    window.nexusAPI?.getSystemStatus().then(setSys);
    window.nexusAPI?.testMostlogin().then((r) => useAppStore.getState().setMostloginOnline(r.ok));
  }, []);

  const groups = [
    { key: 'workspace', items: navItems.filter((i) => i.group === 'workspace') },
    { key: 'content', items: navItems.filter((i) => i.group === 'content') },
    { key: 'analytics', items: navItems.filter((i) => i.group === 'analytics') },
  ].filter((g) => g.items.length > 0);

  const toggleLocale = () => {
    const next = locale === 'ru' ? 'en' : 'ru';
    i18n.changeLanguage(next);
    applyTheme({ locale: next });
    window.nexusAPI?.updateSettings({ locale: next });
  };

  const toggleTheme = async () => {
    const res = await window.nexusAPI?.getSettings();
    const current = normalizeSettings(res?.settings || { theme });
    const nextTheme = current.theme === 'dark' ? 'light' : 'dark';
    const preset = getPresetById(current.colorPreset);
    const payload = settingsToPersist({
      ...current,
      theme: nextTheme,
      colors: getPresetColors(preset, nextTheme),
    });
    applyTheme(payload);
    window.nexusAPI?.updateSettings(payload);
  };

  const NavButton = ({ id, onClick }) => {
    const Icon = ICONS[id];
    const active = activePage === id;
    const labelKey = id === 'analytics' ? 'analyticsPage' : id;
    return (
      <motion.button
        type="button"
        onClick={onClick || (() => setActivePage(id))}
        whileHover={{ x: 2 }}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all border ${
          active
            ? 'text-white shadow-accent-glow'
            : 'border-transparent text-nexus-dim hover:text-white hover:bg-white/5'
        }`}
        style={active ? {
          borderColor: 'color-mix(in srgb, var(--nexus-accent) 40%, transparent)',
          background: 'color-mix(in srgb, var(--nexus-accent) 15%, transparent)',
          borderLeftWidth: 3,
          borderLeftColor: 'var(--nexus-accent)',
        } : {}}
      >
        <Icon className="w-4 h-4 shrink-0" style={active ? { color: 'var(--nexus-accent)' } : {}} />
        {!sidebarCollapsed && t(`nav.${labelKey}`)}
      </motion.button>
    );
  };

  return (
    <aside
      className={`shrink-0 flex flex-col border-r transition-all ${sidebarCollapsed ? 'w-16' : 'w-[240px]'}`}
      style={{ background: 'var(--nexus-sidebar)', borderColor: 'var(--nexus-border)' }}
    >
      <div className="px-4 py-4 border-b flex items-center gap-2" style={{ borderColor: 'var(--nexus-border)' }}>
        {!sidebarCollapsed && (
          <div>
            <div className="text-xs font-semibold tracking-wide" style={{ color: 'var(--nexus-accent)' }}>{t('app.name')}</div>
          </div>
        )}
        <button type="button" onClick={toggleSidebar} className="ml-auto p-1 hover:bg-white/5 rounded">
          <ChevronLeft className={`w-4 h-4 transition ${sidebarCollapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto custom-scrollbar px-2 py-3 space-y-4">
        {groups.map(({ key, items }) => (
          <div key={key}>
            {!sidebarCollapsed && (
              <div className="px-2 mb-1 text-[10px] uppercase tracking-widest text-nexus-dim">{t(`nav.${key}`)}</div>
            )}
            <div className="space-y-0.5">
              {items.map(({ id }) => <NavButton key={id} id={id} />)}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t space-y-2" style={{ borderColor: 'var(--nexus-border)' }}>
        <NavButton id="guide" onClick={() => setHelpOpen(true)} />
        <NavButton id="cabinet" />
        <NavButton id="settings" />

        <div className="flex items-center gap-2 px-1">
          <button type="button" onClick={toggleLocale} className="p-1.5 rounded hover:bg-white/5" title={t('common.language')}><Globe className="w-4 h-4" /></button>
          <button type="button" onClick={toggleTheme} className="p-1.5 rounded hover:bg-white/5" title={t('common.theme')}>
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 px-1">
          <StatusDot ok={sys.python} label={t('status.python')} />
          <StatusDot ok={sys.ffmpeg} label={t('status.ffmpeg')} />
          <StatusDot ok={sys.playwright} label={t('status.playwright')} />
        </div>
        {!sidebarCollapsed && <div className="text-[10px] text-nexus-dim px-1">{t('app.version')}</div>}
      </div>
    </aside>
  );
}
