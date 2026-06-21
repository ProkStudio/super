import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Palette, Moon, Sun, Globe, Type, Upload, Check, AArrowUp } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import i18n from '../../i18n';
import {
  THEME_PRESETS,
  FONT_OPTIONS,
  CUSTOM_COLOR_KEYS,
  getPresetById,
  getPresetColors,
  normalizeSettings,
  countCustomColors,
} from '../../constants/themePresets';
import { settingsToPersist } from '../../lib/theme';

const COLOR_FIELDS = [
  { key: 'primary', labelKey: 'primary' },
  { key: 'accent', labelKey: 'accent' },
  { key: 'background', labelKey: 'background' },
  { key: 'secondary', labelKey: 'secondary' },
  { key: 'sidebar', labelKey: 'sidebar' },
];

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

function ColorPickerField({ label, value, onChange }) {
  const rgb = hexToRgb(value || '#000000');

  const updateRgb = (channel, raw) => {
    const num = Math.max(0, Math.min(255, Number(raw) || 0));
    const next = { ...rgb, [channel]: num };
    onChange(rgbToHex(next.r, next.g, next.b));
  };

  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0">
      <label className="relative cursor-pointer group">
        <span
          className="block w-10 h-10 rounded-lg border-2 border-white/10 group-hover:border-white/25 transition shadow-inner"
          style={{ background: value }}
        />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </label>
      <span className="text-[10px] text-nexus-dim text-center leading-tight">{label}</span>
      <div className="hidden xl:flex items-center gap-0.5 mt-0.5">
        {['r', 'g', 'b'].map((ch) => (
          <input
            key={ch}
            type="number"
            min={0}
            max={255}
            value={rgb[ch]}
            onChange={(e) => updateRgb(ch, e.target.value)}
            className="w-9 nexus-input text-[10px] py-0.5 px-1 text-center"
          />
        ))}
      </div>
    </div>
  );
}

export default function AppearanceSettings({ settings, onSave, onBack }) {
  const { t } = useTranslation();
  const { applyTheme } = useAppStore();
  const [local, setLocal] = useState(() => normalizeSettings(settings));
  const [saved, setSaved] = useState(() => normalizeSettings(settings));

  useEffect(() => {
    const next = normalizeSettings(settings);
    setLocal(next);
    setSaved(next);
  }, [settings]);

  const preset = getPresetById(local.colorPreset);
  const customCount = useMemo(
    () => countCustomColors(local.colors, preset, local.theme),
    [local.colors, local.colorPreset, local.theme, preset],
  );
  const dirty = JSON.stringify(settingsToPersist(local)) !== JSON.stringify(settingsToPersist(saved));

  const preview = (next) => {
    setLocal(next);
    applyTheme(next);
  };

  const setTheme = (theme) => {
    const p = getPresetById(local.colorPreset);
    preview({
      ...local,
      theme,
      colors: getPresetColors(p, theme),
    });
  };

  const selectPreset = (presetId) => {
    const p = getPresetById(presetId);
    preview({
      ...local,
      colorPreset: presetId,
      colors: getPresetColors(p, local.theme),
    });
  };

  const setColor = (key, value) => {
    preview({ ...local, colors: { ...local.colors, [key]: value } });
  };

  const save = () => {
    const payload = settingsToPersist(local);
    applyTheme(payload);
    onSave(payload);
    setSaved(normalizeSettings(payload));
  };

  const pickCustomFont = async () => {
    const path = await window.nexusAPI?.openFile?.([
      { name: 'Fonts', extensions: ['ttf', 'otf', 'woff', 'woff2'] },
    ]);
    if (!path) return;
    const name = path.split(/[/\\]/).pop()?.replace(/\.(ttf|otf|woff2?)$/i, '') || 'Custom';
    preview({ ...local, customFontPath: path, customFontName: name });
  };

  const clearCustomFont = () => {
    preview({ ...local, customFontPath: '', customFontName: '' });
  };

  return (
    <div className="max-w-3xl">
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-nexus-dim hover:text-white mb-4 flex items-center gap-1 transition"
      >
        ← {t('common.back')}
      </button>

      <div className="mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Palette className="w-5 h-5" style={{ color: 'var(--nexus-accent)' }} />
          {t('settings.appearance')}
        </h2>
        <p className="text-sm text-nexus-dim mt-1">{t('settings.appearanceDesc')}</p>
      </div>

      <div className="space-y-4">
        {/* Display mode */}
        <div className="nexus-card p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'color-mix(in srgb, var(--nexus-accent) 15%, transparent)' }}
            >
              <Moon className="w-5 h-5" style={{ color: 'var(--nexus-accent)' }} />
            </div>
            <div>
              <div className="text-sm font-medium">{t('settings.appearanceDisplayMode')}</div>
              <div className="text-xs text-nexus-dim">{t('settings.appearanceDisplayModeDesc')}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Sun className={`w-4 h-4 ${local.theme === 'light' ? 'text-yellow-400' : 'text-nexus-dim'}`} />
            <button
              type="button"
              role="switch"
              aria-checked={local.theme === 'dark'}
              onClick={() => setTheme(local.theme === 'dark' ? 'light' : 'dark')}
              className={`relative w-12 h-6 rounded-full transition ${local.theme === 'dark' ? 'bg-pink-500' : 'bg-zinc-600'}`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition ${local.theme === 'dark' ? 'left-6' : 'left-0.5'}`}
              />
            </button>
            <Moon className={`w-4 h-4 ${local.theme === 'dark' ? 'text-purple-400' : 'text-nexus-dim'}`} />
          </div>
        </div>

        {/* Theme presets + custom colors */}
        <div className="nexus-card p-4 space-y-4">
          <div className="text-sm font-medium">{t('settings.appearanceTheme')}</div>

          <div className="flex flex-wrap items-center gap-3">
            {THEME_PRESETS.map((p) => {
              const active = local.colorPreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectPreset(p.id)}
                  className={`relative w-9 h-9 rounded-full transition ring-offset-2 ring-offset-nexus-card ${active ? 'ring-2 ring-white/80 scale-105' : 'hover:scale-105'}`}
                  style={{ background: p.color }}
                  title={t(`settings.appearancePresets.${p.id}`)}
                >
                  {active && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Check className="w-4 h-4 text-white drop-shadow" strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: 'var(--nexus-border)', background: 'rgba(0,0,0,0.2)' }}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-end gap-4 flex-1">
                {COLOR_FIELDS.map(({ key, labelKey }) => (
                  <ColorPickerField
                    key={key}
                    label={t(`settings.appearanceColors.${labelKey}`)}
                    value={local.colors[key]}
                    onChange={(v) => setColor(key, v)}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={save}
                className="shrink-0 px-4 py-2 rounded-lg text-sm text-white transition hover:opacity-90"
                style={{ background: 'var(--nexus-accent)' }}
              >
                {t('settings.appearanceSaveCount', { current: customCount, max: CUSTOM_COLOR_KEYS.length })}
              </button>
            </div>
          </div>
        </div>

        {/* Language & fonts grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="nexus-card p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Globe className="w-4 h-4 text-nexus-dim" />
              {t('settings.appearanceLanguage')}
            </div>
            <select
              className="nexus-input text-sm"
              value={local.locale}
              onChange={(e) => {
                const locale = e.target.value;
                i18n.changeLanguage(locale);
                preview({ ...local, locale });
              }}
            >
              <option value="ru">{t('settings.appearanceLangRu')}</option>
              <option value="en">{t('settings.appearanceLangEn')}</option>
            </select>
          </div>

          <div className="nexus-card p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Type className="w-4 h-4 text-nexus-dim" />
              {t('settings.appearanceFont')}
            </div>
            <select
              className="nexus-input text-sm"
              value={local.font}
              onChange={(e) => preview({ ...local, font: e.target.value, customFontPath: '', customFontName: '' })}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          <div className="nexus-card p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Upload className="w-4 h-4 text-nexus-dim" />
              {t('settings.appearanceCustomFont')}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={pickCustomFont}
                className="flex-1 nexus-input text-sm text-left hover:bg-white/5 transition truncate"
              >
                {local.customFontPath
                  ? local.customFontName || local.customFontPath.split(/[/\\]/).pop()
                  : t('settings.appearancePickFont')}
              </button>
              {local.customFontPath && (
                <button
                  type="button"
                  onClick={clearCustomFont}
                  className="px-3 py-2 text-xs rounded-lg border hover:bg-white/5 shrink-0"
                  style={{ borderColor: 'var(--nexus-border)' }}
                >
                  {t('settings.appearanceClearFont')}
                </button>
              )}
            </div>
          </div>

          <div className="nexus-card p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <AArrowUp className="w-4 h-4 text-nexus-dim" />
                {t('settings.appearanceFontSize')}
              </div>
              <span className="text-sm font-mono" style={{ color: 'var(--nexus-accent)' }}>
                {local.fontSize}px
              </span>
            </div>
            <input
              type="range"
              min={12}
              max={22}
              value={local.fontSize}
              onChange={(e) => preview({ ...local, fontSize: Number(e.target.value) })}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, var(--nexus-accent) 0%, var(--nexus-accent) ${((local.fontSize - 12) / 10) * 100}%, rgba(255,255,255,0.1) ${((local.fontSize - 12) / 10) * 100}%, rgba(255,255,255,0.1) 100%)`,
              }}
            />
          </div>
        </div>

        {dirty && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={save}
              className="px-5 py-2 rounded-lg text-sm text-white"
              style={{ background: 'var(--nexus-accent)' }}
            >
              {t('common.save')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
