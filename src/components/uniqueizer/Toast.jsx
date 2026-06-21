/**
 * Toast-уведомление с путём к результатам.
 */
import { motion, AnimatePresence } from 'framer-motion';

export default function Toast({ visible, message, outputDir, onClose, onOpenFolder }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="fixed bottom-6 right-6 z-50 max-w-md"
        >
          <div className="bg-cyber-card border border-cyber-green/40 rounded-xl p-4 shadow-neon-cyan-lg backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <span className="text-2xl">✅</span>
              <div className="flex-1 min-w-0">
                <p className="text-cyber-green font-medium text-sm">{message}</p>
                {outputDir && (
                  <p className="text-xs text-cyber-dim mt-1 truncate font-mono">{outputDir}</p>
                )}
                <div className="flex gap-2 mt-3">
                  {outputDir && (
                    <button
                      onClick={onOpenFolder}
                      className="text-xs px-3 py-1.5 rounded-lg bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/30 hover:bg-cyber-cyan/20 transition-colors"
                    >
                      Открыть папку
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="text-xs px-3 py-1.5 rounded-lg text-cyber-dim hover:text-white transition-colors"
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
