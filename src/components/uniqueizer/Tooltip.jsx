/**
 * Подсказка при наведении.
 */
export default function Tooltip({ children, text }) {
  return (
    <span className="relative group inline-flex">
      {children}
      {text && (
        <span
          className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-2 py-1.5 text-xs text-white bg-cyber-bg border border-cyber-cyan/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg"
          role="tooltip"
        >
          {text}
        </span>
      )}
    </span>
  );
}
