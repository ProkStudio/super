import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store/useAppStore';

export default function Toast() {
  const { toast, clearToast } = useAppStore();

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl border shadow-lg text-sm"
          style={{ background: 'var(--nexus-card)', borderColor: 'var(--nexus-border)' }}
          onAnimationComplete={() => setTimeout(clearToast, 3000)}
        >
          {toast.message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
