import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function TerminalLog({
  logs,
  onClear,
  title,
  clearLabel = 'Clear',
  collapsible = true,
  defaultCollapsed = true,
  expandedHeight = 'h-40',
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const toggle = () => setCollapsed((c) => !c);

  if (collapsible && collapsed) {
    return (
      <div className="nexus-card shrink-0">
        <button
          type="button"
          onClick={toggle}
          className="flex items-center justify-between w-full px-3 py-2 text-xs hover:bg-white/[0.03] transition rounded-xl"
        >
          <span className="text-nexus-dim flex items-center gap-2">
            <ChevronUp className="w-3.5 h-3.5" />
            {title}
            {logs.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] border border-white/10 text-zinc-400">
                {logs.length}
              </span>
            )}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={`nexus-card flex flex-col shrink-0 ${expandedHeight}`}>
      <div
        className="flex items-center justify-between px-3 py-2 border-b text-xs shrink-0"
        style={{ borderColor: 'var(--nexus-border)' }}
      >
        <button
          type="button"
          onClick={collapsible ? toggle : undefined}
          className={`flex items-center gap-2 text-nexus-dim ${collapsible ? 'hover:text-white' : ''}`}
        >
          {collapsible && <ChevronDown className="w-3.5 h-3.5" />}
          <span>{title}</span>
          {logs.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] border border-white/10 text-zinc-400">
              {logs.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="text-nexus-dim hover:text-white uppercase tracking-wide"
        >
          {clearLabel}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 font-mono text-xs bg-black/40 min-h-0">
        {logs.length === 0 ? (
          <span className="text-nexus-dim">—</span>
        ) : (
          logs.map((line, i) => (
            <div key={i} className={line.error ? 'text-red-400' : line.success ? 'text-green-400' : 'text-zinc-300'}>
              {line.time && <span className="text-nexus-dim">[{line.time}] </span>}
              {line.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
