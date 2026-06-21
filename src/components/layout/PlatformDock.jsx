import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PLATFORMS } from '../../constants/modules';
import { useAppStore } from '../../store/useAppStore';

function YoutubeIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8zM9.75 15.02V8.98L15.5 12l-5.75 3.02z" />
    </svg>
  );
}

function TiktokIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.8a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.69a8.18 8.18 0 0 0 4.76 1.52V6.76a4.85 4.85 0 0 1-1-.07z" />
    </svg>
  );
}

function InstagramIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </svg>
  );
}

function TelegramIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

const PLATFORM_ICONS = {
  youtube: YoutubeIcon,
  tiktok: TiktokIcon,
  instagram: InstagramIcon,
  telegram: TelegramIcon,
};

const PLATFORM_COLORS = {
  youtube: '#ff0000',
  tiktok: '#fafafa',
  instagram: '#e1306c',
  telegram: '#29b6f6',
};

export default function PlatformDock() {
  const { t } = useTranslation();
  const { activeModule, setActiveModule, showToast } = useAppStore();

  const handleSelect = (platform) => {
    if (!platform.enabled) {
      showToast(t('platform.comingSoon'), 'info');
      return;
    }
    if (platform.id !== activeModule) setActiveModule(platform.id);
  };

  return (
    <div className="fixed bottom-6 left-6 z-40 no-drag">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex gap-1.5 p-2 rounded-2xl border shadow-xl backdrop-blur-md"
        style={{
          background: 'rgba(17, 17, 19, 0.85)',
          borderColor: 'var(--nexus-border)',
        }}
      >
        {PLATFORMS.map((platform) => {
          const Icon = PLATFORM_ICONS[platform.id];
          const active = activeModule === platform.id;
          const disabled = !platform.enabled;
          return (
            <motion.button
              key={platform.id}
              type="button"
              title={t(platform.labelKey)}
              onClick={() => handleSelect(platform)}
              whileHover={disabled ? {} : { scale: 1.06 }}
              whileTap={disabled ? {} : { scale: 0.96 }}
              className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all border ${
                active
                  ? 'ring-2 scale-105 border-transparent'
                  : disabled
                    ? 'opacity-35 cursor-not-allowed border-transparent'
                    : 'border-transparent hover:bg-white/5'
              }`}
              style={active ? { '--tw-ring-color': 'var(--nexus-accent)' } : undefined}
            >
              <Icon
                className="w-5 h-5"
                style={{ color: disabled ? '#71717a' : PLATFORM_COLORS[platform.id] }}
              />
            </motion.button>
          );
        })}
      </motion.div>
    </div>
  );
}
