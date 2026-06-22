import { Check, Minus } from 'lucide-react';

/**
 * Стилизованный чекбокс в духе shadcn / copy — не нативный input.
 */
export default function Checkbox({
  checked = false,
  indeterminate = false,
  onChange,
  disabled = false,
  className = '',
  size = 'md',
}) {
  const dim = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const icon = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3';
  const active = checked || indeterminate;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange?.(!checked);
      }}
      className={`inline-flex items-center justify-center rounded border transition-all shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nexus-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--nexus-bg,#0a0a0a)] disabled:opacity-40 disabled:pointer-events-none ${dim} ${className}`}
      style={{
        borderColor: active
          ? 'var(--nexus-accent)'
          : 'color-mix(in srgb, var(--nexus-border, #333) 80%, white 20%)',
        background: active
          ? 'color-mix(in srgb, var(--nexus-accent) 22%, transparent)'
          : 'color-mix(in srgb, var(--nexus-card, #111) 90%, white 5%)',
        boxShadow: active
          ? '0 0 0 1px color-mix(in srgb, var(--nexus-accent) 35%, transparent)'
          : 'none',
      }}
    >
      {checked && !indeterminate && (
        <Check className={icon} strokeWidth={2.5} style={{ color: 'var(--nexus-accent)' }} />
      )}
      {indeterminate && !checked && (
        <Minus className={icon} strokeWidth={2.5} style={{ color: 'var(--nexus-accent)' }} />
      )}
    </button>
  );
}
