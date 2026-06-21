import { useTranslation } from 'react-i18next';

const STYLES = {
  active: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  ready: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  banned: 'text-red-400 border-red-500/40 bg-red-500/10',
  logged_out: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',
  verify: 'text-orange-400 border-orange-500/40 bg-orange-500/10',
  error: 'text-red-400 border-red-500/40 bg-red-500/10',
  none: 'text-zinc-400 border-zinc-500/20 bg-zinc-500/10',
  unknown: 'text-nexus-dim border-white/10 bg-white/5',
};

export default function TikTokStatusBadge({ status }) {
  const { t } = useTranslation();
  const key = status || 'none';
  const style = STYLES[key] || STYLES.unknown;

  return (
    <span className={`inline-flex text-[10px] font-bold tracking-wide border px-1.5 py-0.5 rounded ${style}`}>
      {t(`tiktok.accounts.status.${key}`, { defaultValue: key })}
    </span>
  );
}
