export default function TerminalLog({ logs, onClear, title, clearLabel = 'Clear' }) {
  return (
    <div className="nexus-card flex flex-col h-40">
      <div className="flex items-center justify-between px-3 py-2 border-b text-xs" style={{ borderColor: 'var(--nexus-border)' }}>
        <span className="text-nexus-dim">{title}</span>
        <button type="button" onClick={onClear} className="text-nexus-dim hover:text-white uppercase tracking-wide">{clearLabel}</button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 font-mono text-xs bg-black/40">
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
