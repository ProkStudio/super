/**
 * Коллапсируемая панель «Продвинутые» настройки.
 */
import { motion, AnimatePresence } from 'framer-motion';
import Tooltip from './Tooltip';
import MethodRow from './MethodRow';
import { METHOD_GROUPS } from './methodGroups';

function FeatureCheckbox({ label, tooltip, checked, onChange, disabled, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className={`flex items-center gap-2 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="w-4 h-4 rounded border-cyber-dim/50 accent-cyber-cyan"
        />
        <Tooltip text={tooltip}>
          <span className="text-sm text-white">{label}</span>
        </Tooltip>
      </label>
      {children}
    </div>
  );
}

function TriStateSelect({ label, tooltip, value, onChange, disabled }) {
  return (
    <div className="flex items-center gap-2">
      <Tooltip text={tooltip}>
        <span className="text-xs text-cyber-dim w-28 flex-shrink-0">{label}</span>
      </Tooltip>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="text-xs flex-1 px-2 py-1.5 rounded-lg bg-cyber-card border border-cyber-dim/30 text-white focus:outline-none focus:border-cyber-cyan/50"
      >
        <option value="auto">Авто (пресет)</option>
        <option value="on">Включить</option>
        <option value="off">Выключить</option>
      </select>
    </div>
  );
}

export default function AdvancedPanel({
  open,
  onToggleOpen,
  adversarial,
  onAdversarialChange,
  adversarialLevel,
  onAdversarialLevelChange,
  faceEnhance,
  onFaceEnhanceChange,
  movingOverlayMode,
  onMovingOverlayModeChange,
  fpsJitterMode,
  onFpsJitterModeChange,
  manualMode,
  onManualModeChange,
  catalog,
  customPreset,
  recommended,
  onMethodToggle,
  onParamChange,
  onResetPreset,
  pythonStatus,
  disabled,
}) {
  const pythonOk = pythonStatus?.available;
  const advDeps = pythonStatus?.adversarialDeps;
  const faceDeps = pythonStatus?.faceDeps;

  const catalogByKey = Object.fromEntries((catalog || []).map((m) => [m.key, m]));

  return (
    <div className="border border-cyber-magenta/20 rounded-xl overflow-hidden shrink-0">
      <button
        type="button"
        onClick={onToggleOpen}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-cyber-card/50 hover:bg-cyber-card transition-colors"
      >
        <span className="text-sm font-medium text-cyber-magenta">Продвинутые</span>
        <span className="text-cyber-dim text-xs">{open ? '▲' : '▼'}</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-3 space-y-3 border-t border-cyber-dim/10">
              <div className="space-y-3 rounded-lg bg-cyber-bg/30 p-2.5 border border-cyber-dim/10">
                <FeatureCheckbox
                  label="Adversarial обход"
                  tooltip="Невидимый пиксельный шум против нейросетевых отпечатков Content ID / fingerprint"
                  checked={adversarial}
                  onChange={onAdversarialChange}
                  disabled={disabled || !pythonOk || !advDeps}
                >
                  {adversarial && (
                    <select
                      value={adversarialLevel}
                      onChange={(e) => onAdversarialLevelChange(e.target.value)}
                      disabled={disabled}
                      className="ml-6 text-xs px-2 py-1.5 rounded-lg bg-cyber-card border border-cyber-dim/30 text-white"
                    >
                      <option value="low">Низкий (FGSM)</option>
                      <option value="medium">Средний (PGD)</option>
                      <option value="high">Высокий (PGD+)</option>
                    </select>
                  )}
                  {!advDeps && pythonOk && (
                    <p className="text-[10px] text-cyber-red ml-6">Нужны: torch, foolbox, opencv-python</p>
                  )}
                  {!pythonOk && (
                    <p className="text-[10px] text-cyber-dim ml-6">Python не найден</p>
                  )}
                </FeatureCheckbox>

                <FeatureCheckbox
                  label="Face Enhance"
                  tooltip="GFPGAN — восстанавливает лица с изменённой текстурой. Очень долго на длинных видео."
                  checked={faceEnhance}
                  onChange={onFaceEnhanceChange}
                  disabled={disabled || !pythonOk || !faceDeps}
                />

                <TriStateSelect
                  label="Moving overlay"
                  tooltip="Полупрозрачные движущиеся объекты — сбивают perceptual hash"
                  value={movingOverlayMode}
                  onChange={onMovingOverlayModeChange}
                  disabled={disabled}
                />

                <TriStateSelect
                  label="FPS jitter"
                  tooltip="Смена временной сетки кадров (29.97 ↔ 30), меняет GOP"
                  value={fpsJitterMode}
                  onChange={onFpsJitterModeChange}
                  disabled={disabled}
                />
              </div>

              <FeatureCheckbox
                label="Ручная настройка методов"
                tooltip="Включить/выключить каждый метод и задать числовые параметры. Пустое поле — значение из пресета."
                checked={manualMode}
                onChange={onManualModeChange}
                disabled={disabled}
              />

              {manualMode && catalog?.length > 0 && (
                <div className="space-y-4 pt-1">
                  <div className="flex flex-wrap items-center justify-between gap-2 sticky top-0 z-10 py-1 -mx-1 px-1 bg-gradient-to-b from-cyber-card/95 to-cyber-card/80 backdrop-blur-sm rounded-lg">
                    <p className="text-[10px] text-cyber-dim leading-snug max-w-[70%]">
                      Placeholder — рекомендация пресета. Диапазоны min/max задают случайность для каждой копии.
                    </p>
                    <button
                      type="button"
                      onClick={onResetPreset}
                      disabled={disabled}
                      className="text-[10px] px-2 py-1 rounded-md border border-cyber-cyan/30 text-cyber-cyan hover:bg-cyber-cyan/10 shrink-0"
                    >
                      Сбросить
                    </button>
                  </div>

                  {METHOD_GROUPS.map((group) => {
                    const methods = group.keys
                      .map((key) => catalogByKey[key])
                      .filter(Boolean);
                    if (!methods.length) return null;
                    return (
                      <section key={group.id}>
                        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-cyber-cyan/90 mb-2 pl-0.5">
                          {group.label}
                        </h4>
                        <div className="space-y-2">
                          {methods.map((m) => (
                            <MethodRow
                              key={m.key}
                              methodKey={m.key}
                              label={m.label}
                              tooltip={m.tooltip}
                              enabled={customPreset?.enabledMethods?.[m.key] ?? false}
                              onToggle={onMethodToggle}
                              params={m.params}
                              values={customPreset}
                              recommended={recommended}
                              onParamChange={onParamChange}
                              disabled={disabled}
                            />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
