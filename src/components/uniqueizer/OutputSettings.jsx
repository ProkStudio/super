/**
 * Настройки папки вывода, шаблона имён и пресетов.
 */
import { useState, useEffect } from 'react';
import Tooltip from './Tooltip';

const PATTERN_OPTIONS = [
  { id: 'unique_n', label: 'уник_1, уник_2…', hint: 'уник_1.mp4' },
  { id: 'original_unique_n', label: 'имя_видео_уник_1…', hint: 'video_уник_1.mp4' },
  { id: 'prefix_n', label: 'свой префикс + номер', hint: 'префикс_1.mp4' },
];

export default function OutputSettings({
  useCustomOutputDir,
  onUseCustomOutputDirChange,
  customOutputDir,
  onPickOutputDir,
  subfolderPerVideo,
  onSubfolderPerVideoChange,
  filenamePattern,
  onFilenamePatternChange,
  filenamePrefix,
  onFilenamePrefixChange,
  lastOutputDir,
  onOpenOutputFolder,
  savedPresets,
  onRefreshPresets,
  presetName,
  onPresetNameChange,
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
  disabled,
}) {
  const [presetsOpen, setPresetsOpen] = useState(false);

  useEffect(() => {
    onRefreshPresets?.();
  }, [onRefreshPresets]);

  const selectedPattern = PATTERN_OPTIONS.find((p) => p.id === filenamePattern) || PATTERN_OPTIONS[0];

  return (
    <div className="border border-cyber-cyan/20 rounded-xl overflow-hidden shrink-0">
      <div className="px-3 py-2 bg-cyber-card/50">
        <p className="text-sm font-medium text-cyber-cyan">Вывод</p>
      </div>

      <div className="p-3 space-y-3">
        <label className={`flex items-center gap-2 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            checked={useCustomOutputDir}
            onChange={(e) => onUseCustomOutputDirChange(e.target.checked)}
            disabled={disabled}
            className="w-4 h-4 shrink-0 accent-cyber-cyan"
          />
          <Tooltip text="По умолчанию — Uniqued_Видео рядом с исходником">
            <span className="text-sm text-white">Своя папка вывода</span>
          </Tooltip>
        </label>

        {useCustomOutputDir && (
          <div className="space-y-1.5 pl-1">
            <button
              type="button"
              onClick={onPickOutputDir}
              disabled={disabled}
              className="w-full text-xs py-2 rounded border border-cyber-cyan/40 text-cyber-cyan hover:bg-cyber-cyan/10"
            >
              Выбрать папку…
            </button>
            <p
              className="text-[10px] text-cyber-dim font-mono break-all leading-relaxed px-1"
              title={customOutputDir}
            >
              {customOutputDir || 'Папка не выбрана'}
            </p>
          </div>
        )}

        <label className={`flex items-center gap-2 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            checked={subfolderPerVideo}
            onChange={(e) => onSubfolderPerVideoChange(e.target.checked)}
            disabled={disabled}
            className="w-4 h-4 shrink-0 accent-cyber-cyan"
          />
          <Tooltip text="output/ИмяВидео/уник_1.mp4 — удобно в пакетном режиме">
            <span className="text-sm text-white">Подпапка на каждое видео</span>
          </Tooltip>
        </label>

        <div className="space-y-2">
          <Tooltip text="Как называть файлы копий">
            <span className="text-xs text-cyber-dim">Шаблон имени</span>
          </Tooltip>
          <div className="space-y-1.5">
            {PATTERN_OPTIONS.map((opt) => (
              <label
                key={opt.id}
                className={`flex items-start gap-2 rounded-lg px-2 py-1.5 border transition-colors ${
                  filenamePattern === opt.id
                    ? 'border-cyber-cyan/50 bg-cyber-cyan/5'
                    : 'border-transparent hover:border-cyber-dim/20'
                } ${disabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}
              >
                <input
                  type="radio"
                  name="filenamePattern"
                  checked={filenamePattern === opt.id}
                  onChange={() => onFilenamePatternChange(opt.id)}
                  disabled={disabled}
                  className="mt-0.5 shrink-0 accent-cyber-cyan"
                />
                <span className="min-w-0">
                  <span className="block text-xs text-white leading-snug">{opt.label}</span>
                  <span className="block text-[10px] text-cyber-dim font-mono mt-0.5">{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {filenamePattern === 'prefix_n' && (
            <input
              type="text"
              value={filenamePrefix}
              onChange={(e) => onFilenamePrefixChange(e.target.value)}
              disabled={disabled}
              placeholder="префикс, напр. uniq"
              className="w-full text-xs px-2 py-1.5 rounded bg-cyber-card border border-cyber-dim/30 text-white"
            />
          )}
          <p className="text-[10px] text-cyber-dim/80 px-1">
            Сейчас: {selectedPattern.hint.replace('_1', '_N')}
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenOutputFolder}
          disabled={disabled || !lastOutputDir}
          className="w-full text-xs py-2 rounded border border-cyber-magenta/30 text-cyber-magenta hover:bg-cyber-magenta/10 disabled:opacity-40"
        >
          Открыть папку вывода
        </button>

        <div className="border-t border-cyber-dim/20 pt-2">
          <button
            type="button"
            onClick={() => setPresetsOpen((o) => !o)}
            className="w-full flex justify-between text-xs text-cyber-dim hover:text-white py-1"
          >
            <span>Пресеты настроек</span>
            <span>{presetsOpen ? '▲' : '▼'}</span>
          </button>
          {presetsOpen && (
            <div className="mt-2 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => onPresetNameChange(e.target.value)}
                  placeholder="Имя пресета"
                  disabled={disabled}
                  className="flex-1 min-w-0 text-xs px-2 py-1.5 rounded bg-cyber-card border border-cyber-dim/30 text-white"
                />
                <button
                  type="button"
                  onClick={onSavePreset}
                  disabled={disabled || !presetName.trim()}
                  className="shrink-0 text-xs px-2 py-1.5 rounded border border-cyber-cyan/40 text-cyber-cyan"
                >
                  Сохранить
                </button>
              </div>
              {savedPresets?.length > 0 ? (
                <div className="flex gap-2">
                  <select
                    className="flex-1 min-w-0 text-xs px-2 py-1.5 rounded bg-cyber-card border border-cyber-dim/30 text-white"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) onLoadPreset(e.target.value);
                      e.target.value = '';
                    }}
                    disabled={disabled}
                  >
                    <option value="" disabled>Загрузить…</option>
                    {savedPresets.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const name = window.prompt('Удалить пресет:', presetName || savedPresets[0]);
                      if (name) onDeletePreset(name);
                    }}
                    disabled={disabled}
                    className="shrink-0 text-xs px-2 py-1.5 rounded border border-cyber-red/30 text-cyber-red"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <p className="text-[10px] text-cyber-dim">Нет сохранённых пресетов</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
