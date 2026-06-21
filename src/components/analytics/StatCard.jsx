import { formatNumber } from '../../lib/formatters';

export default function StatCard({ label, value, icon: Icon, iconBg, iconColor }) {
  return (
    <div className="nexus-card p-4 flex items-center justify-between gap-3 min-w-0">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-nexus-dim truncate">{label}</div>
        <div className="text-2xl font-bold font-mono mt-1 truncate">{formatNumber(value)}</div>
      </div>
      {Icon && (
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      )}
    </div>
  );
}
