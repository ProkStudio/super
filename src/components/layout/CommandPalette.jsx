import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { buildCommandItems, filterCommandItems } from '../../lib/commandItems';

const GROUP_LABELS = {
  navigation: 'command.groupNavigation',
  settings: 'command.groupSettings',
  actions: 'command.groupActions',
};

export default function CommandPalette() {
  const { t } = useTranslation();
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    setActivePage,
    setSettingsSubPage,
    setHelpOpen,
    setHotkeysOpen,
    activeModule,
  } = useAppStore();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);

  const allItems = useMemo(() => buildCommandItems(t, activeModule), [t, activeModule]);
  const filtered = useMemo(() => filterCommandItems(allItems, query), [allItems, query]);

  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((item) => {
      if (!map.has(item.group)) map.set(item.group, []);
      map.get(item.group).push(item);
    });
    return map;
  }, [filtered]);

  const flatItems = useMemo(() => filtered, [filtered]);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [commandPaletteOpen]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    if (selected >= flatItems.length) setSelected(Math.max(0, flatItems.length - 1));
  }, [flatItems.length, selected]);

  const close = () => setCommandPaletteOpen(false);

  const runSelected = (item) => {
    if (!item) return;
    item.run({ setActivePage, setSettingsSubPage, setHelpOpen, setHotkeysOpen, close });
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runSelected(flatItems[selected]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  if (!commandPaletteOpen) return null;

  let itemIndex = -1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/60 backdrop-blur-sm"
        onClick={close}
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: -8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: -8 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-xl nexus-card overflow-hidden shadow-2xl border border-purple-500/20"
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--nexus-border)' }}>
            <Search className="w-4 h-4 text-nexus-dim shrink-0" />
            <input
              ref={inputRef}
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-nexus-dim"
              placeholder={t('search.placeholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-nexus-dim">Esc</kbd>
          </div>

          <div className="max-h-[50vh] overflow-y-auto custom-scrollbar py-2">
            {flatItems.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-nexus-dim">{t('command.noResults')}</p>
            ) : (
              [...grouped.entries()].map(([group, items]) => (
                <div key={group}>
                  <div className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-nexus-dim">
                    {t(GROUP_LABELS[group] || group)}
                  </div>
                  {items.map((item) => {
                    itemIndex += 1;
                    const active = itemIndex === selected;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onMouseEnter={() => setSelected(itemIndex)}
                        onClick={() => runSelected(item)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition text-left ${
                          active ? 'bg-purple-500/15 text-white' : 'hover:bg-white/5 text-foreground'
                        }`}
                      >
                        {Icon && <Icon className="w-4 h-4 shrink-0" style={{ color: 'var(--nexus-accent)' }} />}
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.shortcut && (
                          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-nexus-dim">{item.shortcut}</kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="px-4 py-2 border-t text-[10px] text-nexus-dim flex justify-between" style={{ borderColor: 'var(--nexus-border)' }}>
            <span>{t('command.hint')}</span>
            <span>↑↓ · Enter · {t('search.hint')}</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
