/**
 * Пресеты уникализации (порт из Python presets.py)
 */

const { getRecommendedDefaults } = require('./methodCatalog');

/** Ключи всех методов FFmpeg */
const METHOD_KEYS = [
  'crop', 'rotate', 'hflip', 'speed', 'color', 'noise',
  'vignette', 'blur', 'resample', 'encode', 'trim',
  'audio', 'watermark', 'fade', 'remux',
  'movingOverlay', 'fpsJitter',
];

/** Умеренный пресет — toggle OFF */
function moderatePreset() {
  const defaults = getRecommendedDefaults(false);
  return {
    enabledMethods: {
      crop: true,
      rotate: false,
      hflip: true,
      speed: true,
      color: true,
      noise: false,
      vignette: false,
      blur: false,
      resample: false,
      encode: true,
      trim: false,
      audio: true,
      watermark: false,
      fade: true,
      remux: true,
      movingOverlay: true,
      fpsJitter: true,
    },
    ...defaults,
  };
}

/** Максимальный пресет — toggle ON, все методы */
function maximumPreset() {
  const enabled = {};
  METHOD_KEYS.forEach((k) => { enabled[k] = true; });
  const defaults = getRecommendedDefaults(true);
  return {
    enabledMethods: enabled,
    ...defaults,
  };
}

/** Выбор пресета по флагу maxMode */
function getPreset(maxMode) {
  return maxMode ? maximumPreset() : moderatePreset();
}

/** Глубокое слияние enabledMethods */
function mergeEnabledMethods(base, custom) {
  if (!custom) return { ...base };
  return { ...base, ...custom };
}

/**
 * Собирает итоговый пресет: базовый moderate/max + ручные оверрайды.
 */
function buildEffectivePreset({ maxMode, manualMode, customPreset, featureOverrides }) {
  const base = JSON.parse(JSON.stringify(getPreset(maxMode)));

  if (manualMode && customPreset) {
    if (customPreset.enabledMethods) {
      base.enabledMethods = mergeEnabledMethods(base.enabledMethods, customPreset.enabledMethods);
    }
    const numericKeys = [
      'cropMaxPct', 'rotateMaxDeg', 'speedMin', 'speedMax',
      'brightnessMin', 'brightnessMax', 'contrastMin', 'contrastMax',
      'saturationMin', 'saturationMax', 'hueMin', 'hueMax', 'colorBalanceMax',
      'noiseMin', 'noiseMax',
      'crfMin', 'crfMax', 'gopMin', 'gopMax',
      'blurSigmaMin', 'blurSigmaMax', 'resampleMin', 'resampleMax',
      'trimFramesMin', 'trimFramesMax',
      'volumeMin', 'volumeMax', 'audioDelayMax',
      'pitchMin', 'pitchMax',
      'eqFrequencyMin', 'eqFrequencyMax', 'eqGainMin', 'eqGainMax',
      'sampleRateMin', 'sampleRateMax',
      'fadeMin', 'fadeMax',
      'overlayCount', 'overlayOpacity', 'overlaySpeed', 'fpsJitterPts',
    ];
    for (const key of numericKeys) {
      if (customPreset[key] !== undefined && customPreset[key] !== '' && customPreset[key] !== null) {
        base[key] = Number(customPreset[key]);
      }
    }
  }

  if (featureOverrides) {
    if (featureOverrides.movingOverlay === true) {
      base.enabledMethods.movingOverlay = true;
    } else if (featureOverrides.movingOverlay === false) {
      base.enabledMethods.movingOverlay = false;
    }
    if (featureOverrides.fpsJitter === true) {
      base.enabledMethods.fpsJitter = true;
    } else if (featureOverrides.fpsJitter === false) {
      base.enabledMethods.fpsJitter = false;
    }
  }

  return base;
}

module.exports = {
  METHOD_KEYS,
  moderatePreset,
  maximumPreset,
  getPreset,
  buildEffectivePreset,
};
