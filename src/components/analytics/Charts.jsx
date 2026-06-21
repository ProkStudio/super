function formatDayLabel(day, locale = 'ru-RU') {
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

export default function SimpleAreaChart({ data, height = 200, color = '#a855f7' }) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center text-nexus-dim text-sm" style={{ height }}>
        —
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const w = 100;
  const h = 100;
  const pad = 2;
  const points = data.map((d, i) => {
    const x = pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2);
    const y = h - pad - (d.value / max) * (h - pad * 2);
    return `${x},${y}`;
  });
  const line = points.join(' ');
  const area = `${pad},${h - pad} ${line} ${w - pad},${h - pad}`;

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => Math.round((max / ticks) * (ticks - i)));

  return (
    <div className="flex gap-3" style={{ height }}>
      <div className="flex flex-col justify-between text-[10px] text-nexus-dim py-1 shrink-0 w-12 text-right">
        {yTicks.map((v) => (
          <span key={v}>{v >= 1000 ? `${Math.round(v / 1000)}k` : v}</span>
        ))}
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full flex-1" preserveAspectRatio="none">
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#areaGrad)" />
          <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="flex justify-between text-[10px] text-nexus-dim mt-1 px-1">
          <span>{formatDayLabel(data[0].day)}</span>
          {data.length > 2 && <span>{formatDayLabel(data[Math.floor(data.length / 2)].day)}</span>}
          <span>{formatDayLabel(data[data.length - 1].day)}</span>
        </div>
      </div>
    </div>
  );
}

export function SimpleBarChart({ data, height = 200, color = '#a855f7' }) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center text-nexus-dim text-sm" style={{ height }}>
        —
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const w = 100;
  const h = 100;
  const pad = 4;
  const barW = (w - pad * 2) / data.length - 0.5;

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => Math.round((max / ticks) * (ticks - i)));

  return (
    <div className="flex gap-3" style={{ height }}>
      <div className="flex flex-col justify-between text-[10px] text-nexus-dim py-1 shrink-0 w-8 text-right">
        {yTicks.map((v) => <span key={v}>{v}</span>)}
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full flex-1" preserveAspectRatio="none">
          {data.map((d, i) => {
            const barH = ((d.value / max) * (h - pad * 2)) || 0;
            const x = pad + i * ((w - pad * 2) / data.length);
            const y = h - pad - barH;
            return (
              <rect
                key={d.day}
                x={x}
                y={y}
                width={Math.max(barW, 0.3)}
                height={barH}
                fill={color}
                rx="0.5"
                opacity={d.value ? 0.9 : 0.15}
              />
            );
          })}
        </svg>
        <div className="flex justify-between text-[10px] text-nexus-dim mt-1 px-1">
          <span>{formatDayLabel(data[0].day)}</span>
          {data.length > 2 && <span>{formatDayLabel(data[Math.floor(data.length / 2)].day)}</span>}
          <span>{formatDayLabel(data[data.length - 1].day)}</span>
        </div>
      </div>
    </div>
  );
}
