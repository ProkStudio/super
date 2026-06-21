import {
  Users, Key, Zap, ListChecks, Sparkles, Wand2, BarChart3, LineChart, Settings,
  BookOpen, Palette, Globe, Send, RefreshCw, Monitor, Database, Keyboard,
  Shield, Download, Play,
} from 'lucide-react';
import { getNavItems } from '../constants/modules';

export const SETTINGS_CATEGORIES = [
  { id: 'appearance', icon: Palette },
  { id: 'browser', icon: Globe },
  { id: 'apiKeys', icon: Key },
  { id: 'notifications', icon: Send },
  { id: 'autochecker', icon: RefreshCw },
  { id: 'system', icon: Monitor },
  { id: 'backup', icon: Database },
  { id: 'hotkeys', icon: Keyboard },
];

const NAV_ICONS = {
  profiles: Users,
  accounts: Key,
  automation: Zap,
  tasks: ListChecks,
  jokes: Sparkles,
  uniqueizer: Wand2,
  results: BarChart3,
  analytics: LineChart,
  settings: Settings,
  guide: BookOpen,
  cabinet: Shield,
};

export function buildCommandItems(t, activeModule = 'youtube') {
  const items = [];
  const navItems = getNavItems(activeModule);

  navItems.filter((i) => i.group !== 'bottom').forEach(({ id, shortcut }) => {
    const labelKey = id === 'analytics' ? 'analyticsPage' : id;
    items.push({
      id: `nav-${id}`,
      group: 'navigation',
      label: t(`nav.${labelKey}`),
      keywords: [id, t(`nav.${labelKey}`)],
      icon: NAV_ICONS[id],
      shortcut: shortcut ? `Ctrl+${shortcut}` : null,
      run: ({ setActivePage, close }) => {
        setActivePage(id);
        close();
      },
    });
  });

  items.push({
    id: 'nav-guide',
    group: 'navigation',
    label: t('nav.guide'),
    keywords: ['guide', 'help', t('nav.guide')],
    icon: BookOpen,
    shortcut: '?',
    run: ({ setHelpOpen, close }) => {
      setHelpOpen(true);
      close();
    },
  });

  items.push({
    id: 'nav-cabinet',
    group: 'navigation',
    label: t('nav.cabinet'),
    keywords: ['cabinet', 'license'],
    icon: Shield,
    run: ({ setActivePage, close }) => {
      setActivePage('cabinet');
      close();
    },
  });

  SETTINGS_CATEGORIES.forEach(({ id, icon }) => {
    items.push({
      id: `settings-${id}`,
      group: 'settings',
      label: t(`settings.${id}`),
      keywords: [id, t(`settings.${id}`), t(`settings.${id}Desc`)],
      icon,
      run: ({ setSettingsSubPage, close }) => {
        setSettingsSubPage(id);
        close();
      },
    });
  });

  items.push({
    id: 'action-backup',
    group: 'actions',
    label: t('command.createBackup'),
    keywords: ['backup', 'export'],
    icon: Download,
    run: async ({ close }) => {
      close();
      await window.nexusAPI?.createBackup?.();
    },
  });

  items.push({
    id: 'action-checker',
    group: 'actions',
    label: t('command.runChecker'),
    keywords: ['checker', 'youtube'],
    icon: Play,
    run: async ({ close }) => {
      close();
      await window.nexusAPI?.runCheckerNow?.();
    },
  });

  items.push({
    id: 'action-hotkeys',
    group: 'actions',
    label: t('settings.hotkeys'),
    keywords: ['hotkeys', 'keyboard'],
    icon: Keyboard,
    run: ({ setHotkeysOpen, close }) => {
      setHotkeysOpen(true);
      close();
    },
  });

  return items;
}

export function filterCommandItems(items, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const hay = [item.label, ...(item.keywords || [])].join(' ').toLowerCase();
    return hay.includes(q) || q.split(/\s+/).every((part) => hay.includes(part));
  });
}
