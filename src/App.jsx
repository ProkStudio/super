import { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import i18n from './i18n';
import { useAppStore } from './store/useAppStore';
import { getNavItems } from './constants/modules';
import TitleBar from './components/layout/TitleBar';
import Sidebar from './components/layout/Sidebar';
import PlatformDock from './components/layout/PlatformDock';
import CommandPalette from './components/layout/CommandPalette';
import HotkeysModal from './components/layout/HotkeysModal';
import Toast from './components/ui/Toast';
import Profiles from './components/pages/Profiles';
import Accounts from './components/pages/Accounts';
import Automation from './components/pages/Automation';
import Tasks from './components/pages/Tasks';
import Jokes from './components/pages/Jokes';
import Uniqueizer from './components/pages/Uniqueizer';
import Results from './components/pages/Results';
import Analytics from './components/pages/Analytics';
import Settings from './components/pages/Settings';
import Cabinet from './components/pages/Cabinet';
import TikTokAccounts from './components/pages/tiktok/TikTokAccounts';
import TikTokAutomation from './components/pages/tiktok/TikTokAutomation';
import TikTokResults from './components/pages/tiktok/TikTokResults';
import GuideDrawer from './components/layout/GuideDrawer';
import UpdateModal from './components/layout/UpdateModal';
import ChangelogModal from './components/layout/ChangelogModal';
import UpdateToast from './components/layout/UpdateToast';
import LaunchExperience from './components/layout/LaunchExperience';

const YOUTUBE_PAGES = {
  profiles: Profiles,
  accounts: Accounts,
  automation: Automation,
  tasks: Tasks,
  jokes: Jokes,
  uniqueizer: Uniqueizer,
  results: Results,
  analytics: Analytics,
  settings: Settings,
  cabinet: Cabinet,
};

const TIKTOK_PAGES = {
  profiles: Profiles,
  accounts: TikTokAccounts,
  automation: TikTokAutomation,
  results: TikTokResults,
  settings: Settings,
  cabinet: Cabinet,
};

function resolvePage(activeModule, activePage) {
  const map = activeModule === 'tiktok' ? TIKTOK_PAGES : YOUTUBE_PAGES;
  return map[activePage] || Profiles;
}

export default function App() {
  const {
    activePage,
    activeModule,
    setActivePage,
    setCommandPaletteOpen,
    applyTheme,
    hydrateModule,
    toggleSidebar,
    setHotkeysOpen,
    setHelpOpen,
    helpOpen,
    settingsSubPage,
    setSelectedProfileIds,
  } = useAppStore();

  const navItems = useMemo(() => getNavItems(activeModule), [activeModule]);

  useEffect(() => {
    window.nexusAPI?.getSettings().then((res) => {
      if (res?.settings) {
        applyTheme(res.settings);
        hydrateModule(res.settings);
        const locale = res.settings.locale || 'ru';
        i18n.changeLanguage(locale);
        if (res.settings.sidebarCollapsed != null) {
          useAppStore.setState({ sidebarCollapsed: !!res.settings.sidebarCollapsed });
        }
        if (!res.settings.locale) window.nexusAPI?.updateSettings({ locale: 'ru' });
      } else {
        i18n.changeLanguage('ru');
      }
    });
    window.nexusAPI?.getProfilesMeta?.().then((data) => {
      const ids = data?.selectedIds;
      if (ids?.length) setSelectedProfileIds(ids.map(String));
    });
  }, [applyTheme, hydrateModule, setSelectedProfileIds]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
        setHotkeysOpen(false);
        setHelpOpen(false);
        return;
      }
      if (e.key === '?' && !e.ctrlKey && !e.altKey) {
        const target = e.target;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        e.preventDefault();
        setHelpOpen(!helpOpen);
        return;
      }
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        if (activePage === 'automation') {
          window.dispatchEvent(new CustomEvent('techpro-save-automation-preset'));
        }
        return;
      }
      if (e.ctrlKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const item = navItems.find((n) => n.shortcut === e.key);
        if (item) setActivePage(item.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activePage, navItems, setActivePage, setCommandPaletteOpen, setHotkeysOpen, setHelpOpen, helpOpen, toggleSidebar]);

  const Page = resolvePage(activeModule, activePage);

  return (
    <div className="h-full flex flex-col bg-background text-foreground">
      <TitleBar onSearchClick={() => setCommandPaletteOpen(true)} />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 p-6 min-h-0 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeModule}-${activePage}${activePage === 'settings' ? settingsSubPage : ''}`}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              <Page />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <PlatformDock />
      <CommandPalette />
      <HotkeysModal />
      <GuideDrawer />
      <LaunchExperience />
      <ChangelogModal />
      <UpdateToast />
      <UpdateModal />
      <Toast />
    </div>
  );
}
