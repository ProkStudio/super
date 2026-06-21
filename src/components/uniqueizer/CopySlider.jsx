/**
 * Слайдер количества копий (1–50).
 */
import { motion } from 'framer-motion';

const MAX_COPIES = 50;
const TICKS = [1, 10, 25, 50];

export default function CopySlider({ value, onChange, disabled }) {
  return (
    <div className={`space-y-3 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between">
        <label className="text-sm text-cyber-dim">Количество копий</label>
        <motion.span
          key={value}
          initial={{ scale: 1.3, color: '#FF00FF' }}
          animate={{ scale: 1, color: '#00FFFF' }}
          className="text-2xl font-bold font-mono"
        >
          {value}
        </motion.span>
      </div>

      <div className="relative">
        <input
          type="range"
          min={1}
          max={MAX_COPIES}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          className="w-full h-2 appearance-none bg-cyber-card rounded-full outline-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-5
            [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-cyber-cyan
            [&::-webkit-slider-thumb]:shadow-neon-cyan
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:hover:scale-110"
        />
        <div className="flex justify-between mt-1 px-0.5">
          {TICKS.map((n) => (
            <span
              key={n}
              className={`text-[10px] ${value >= n - 2 && value <= n + 2 ? 'text-cyber-cyan' : 'text-cyber-dim/50'}`}
            >
              {n}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
