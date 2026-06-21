import { useTranslation } from 'react-i18next';

const STYLES = {
  active: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  banned: 'text-red-400 border-red-500/40 bg-red-500/10',
  disabled: 'text-red-400 border-red-500/40 bg-red-500/10',
  logged_out: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',
  verify: 'text-orange-400 border-orange-500/40 bg-orange-500/10',
  no_profile: 'text-zinc-400 border-zinc-500/40 bg-zinc-500/10',
  no_channel: 'text-violet-400 border-violet-500/40 bg-violet-500/10',
  error: 'text-red-400 border-red-500/40 bg-red-500/10',
  unknown: 'text-nexus-dim border-white/10 bg-white/5',
};

export default function AccountStatusBadge({ status, message, compact }) {
  const { t } = useTranslation();
  const key = status || 'unknown';
  const style = STYLES[key] || STYLES.unknown;

  return (
    <span
      className={`inline-flex items-center text-[10px] font-bold tracking-wide border px-1.5 py-0.5 rounded shrink-0 ${style}`}
      title={message || t(`accounts.statusLabels.${key}`, { defaultValue: key })}
    >
      {compact ? key.slice(0, 4).toUpperCase() : t(`accounts.statusLabels.${key}`, { defaultValue: key.toUpperCase() })}
    </span>
  );
}
