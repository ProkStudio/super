/**
 * Неоновый toggle «Максимальная уникализация».
 */
import { motion } from 'framer-motion';

export default function ToggleSwitch({ enabled, onChange, disabled }) {
  return (
    <div
      className={`flex items-center justify-between ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <div>
        <p className="text-sm font-medium text-white">Максимальная уникализация</p>
        <p className="text-xs text-cyber-dim mt-0.5">
          {enabled ? 'Все методы, расширенные диапазоны' : 'Умеренный пресет — базовый набор эффектов'}
        </p>
      </div>

      <button
        onClick={() => onChange(!enabled)}
        disabled={disabled}
        className="no-drag relative w-14 h-7 rounded-full focus:outline-none"
      >
        <motion.div
          className="absolute inset-0 rounded-full"
          animate={{
            background: enabled
              ? 'linear-gradient(90deg, #FF00FF, #00FFFF)'
              : '#1a1a2e',
            boxShadow: enabled
              ? '0 0 20px rgba(255,0,255,0.5), 0 0 20px rgba(0,255,255,0.3)'
              : 'none',
          }}
          transition={{ duration: 0.3 }}
        />
        <motion.div
          className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md"
          animate={{ left: enabled ? 'calc(100% - 26px)' : '2px' }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
        {enabled && (
          <motion.div
            className="absolute inset-0 rounded-full"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255,0,255,0.2), transparent)',
            }}
          />
        )}
      </button>
    </div>
  );
}
