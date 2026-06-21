/**
 * Галочка «Пакетная обработка» — несколько видео за раз.
 */
import { motion } from 'framer-motion';

export default function BatchToggle({ enabled, onChange, disabled }) {
  return (
    <label
      className={`flex items-center gap-3 cursor-pointer select-none ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className="no-drag relative w-5 h-5 rounded border-2 flex-shrink-0 transition-all focus:outline-none"
        style={{
          borderColor: enabled ? '#00FFFF' : '#444466',
          boxShadow: enabled ? '0 0 10px rgba(0,255,255,0.5)' : 'none',
          background: enabled ? 'rgba(0,255,255,0.15)' : 'transparent',
        }}
      >
        {enabled && (
          <motion.svg
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            viewBox="0 0 12 12"
            className="absolute inset-0 m-auto w-3 h-3"
          >
            <path
              d="M2 6l3 3 5-5"
              stroke="#00FFFF"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.svg>
        )}
      </button>
      <div>
        <p className="text-sm font-medium text-white">Пакетная обработка</p>
        <p className="text-xs text-cyber-dim mt-0.5">
          {enabled ? 'Можно добавить несколько видео сразу' : 'Одно видео за раз'}
        </p>
      </div>
    </label>
  );
}
