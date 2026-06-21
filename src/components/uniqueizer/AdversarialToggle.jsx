/**
 * Быстрый переключатель Adversarial рядом с «Максимальная уникализация».
 */
import Tooltip from './Tooltip';

export default function AdversarialToggle({
  enabled,
  onChange,
  disabled,
  pythonAvailable,
  depsInstalled,
}) {
  const canEnable = pythonAvailable && depsInstalled;

  return (
    <label
      className={`flex items-center gap-2 ${!canEnable || disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <input
        type="checkbox"
        checked={enabled && canEnable}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled || !canEnable}
        className="w-4 h-4 rounded accent-cyber-magenta"
      />
      <Tooltip text="Невидимый шум против нейросетевых отпечатков (Content ID, TikTok/YouTube fingerprint)">
        <span className="text-sm text-white">Adversarial обход</span>
      </Tooltip>
      {!canEnable && (
        <span className="text-[10px] text-cyber-dim">(нужен Python)</span>
      )}
    </label>
  );
}
