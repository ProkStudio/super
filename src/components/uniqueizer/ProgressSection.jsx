/**
 * Два прогресс-бара: общий и текущей задачи.
 */
import { motion } from 'framer-motion';

function ProgressBar({ label, percent, color = 'cyan', pulsing }) {
  const isCyan = color === 'cyan';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-cyber-dim flex items-center gap-2 truncate mr-2">
          {pulsing && (
            <motion.span
              className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${isCyan ? 'bg-cyber-cyan' : 'bg-cyber-magenta'}`}
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
          )}
          <span className="truncate">{label}</span>
        </span>
        <span className={`font-mono flex-shrink-0 ${isCyan ? 'text-cyber-cyan' : 'text-cyber-magenta'}`}>
          {percent}%
        </span>
      </div>
      <div className="h-2 bg-cyber-card rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${isCyan ? 'bg-cyber-cyan progress-glow' : 'bg-cyber-magenta progress-glow-magenta'}`}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

export default function ProgressSection({ totalProgress, copyProgress, currentLabel, isProcessing }) {
  if (!isProcessing && totalProgress === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="space-y-3"
    >
      <ProgressBar
        label="Общий прогресс"
        percent={totalProgress}
        color="cyan"
        pulsing={isProcessing}
      />
      {currentLabel && (
        <ProgressBar
          label={currentLabel}
          percent={copyProgress}
          color="magenta"
          pulsing={isProcessing}
        />
      )}
    </motion.div>
  );
}
