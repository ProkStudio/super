/**
 * Терминальный лог с эффектом печатной машинки и цветовым кодированием.
 */
import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const LEVEL_COLORS = {
  info: 'text-cyber-cyan',
  success: 'text-cyber-green',
  error: 'text-cyber-red',
  progress: 'text-cyber-magenta',
};

function LogLine({ entry, index }) {
  const time = new Date(entry.timestamp).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.02 }}
      className="font-mono text-xs leading-5"
    >
      <span className="text-cyber-dim/60">[{time}]</span>{' '}
      <span className={LEVEL_COLORS[entry.level] || 'text-white'}>
        {entry.text}
      </span>
    </motion.div>
  );
}

export default function TerminalLog({ logs }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col h-full min-h-[140px]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-cyber-cyan/10">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-cyber-red/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-cyber-green/80" />
        </div>
        <span className="text-xs text-cyber-dim font-mono ml-2">terminal — ffmpeg log</span>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-3 bg-black/40 font-mono"
      >
        {logs.length === 0 ? (
          <p className="text-cyber-dim/40 text-xs font-mono">Ожидание команд…</p>
        ) : (
          <AnimatePresence>
            {logs.map((entry, i) => (
              <LogLine key={entry.id} entry={entry} index={i} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
