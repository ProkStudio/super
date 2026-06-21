export default function RangeSlider({ label, value, min, max, step = 1, suffix = '', onChange }) {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-nexus-dim">{label}</span>
        <span className="font-mono font-medium" style={{ color: 'var(--nexus-accent)' }}>{value}{suffix}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, background: 'var(--nexus-accent)' }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full pointer-events-none shadow-[0_0_8px_rgba(168,85,247,0.45)]"
          style={{ background: 'var(--nexus-accent)', left: `calc(${pct}% - 7px)` }}
        />
      </div>
    </div>
  );
}
