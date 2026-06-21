/** Группы методов для ручной настройки (порядок внутри группы). */
export const METHOD_GROUPS = [
  {
    id: 'geometry',
    label: 'Геометрия',
    keys: ['crop', 'rotate', 'hflip', 'resample', 'trim'],
  },
  {
    id: 'picture',
    label: 'Картинка',
    keys: ['color', 'noise', 'vignette', 'blur', 'fade', 'watermark', 'movingOverlay'],
  },
  {
    id: 'time',
    label: 'Время',
    keys: ['speed', 'fpsJitter'],
  },
  {
    id: 'audio',
    label: 'Аудио',
    keys: ['audio'],
  },
  {
    id: 'encode',
    label: 'Кодирование',
    keys: ['encode', 'remux'],
  },
];

/** Подгруппы полей для методов с большим числом параметров. */
export const PARAM_SECTIONS = {
  color: [
    { title: 'Яркость', keys: ['brightnessMin', 'brightnessMax'] },
    { title: 'Контраст', keys: ['contrastMin', 'contrastMax'] },
    { title: 'Насыщенность', keys: ['saturationMin', 'saturationMax'] },
    { title: 'Оттенок', keys: ['hueMin', 'hueMax'] },
    { title: 'Баланс белого', keys: ['colorBalanceMax'] },
  ],
  audio: [
    { title: 'Громкость', keys: ['volumeMin', 'volumeMax'] },
    { title: 'Задержка', keys: ['audioDelayMax'] },
    { title: 'Сдвиг тона', keys: ['pitchMin', 'pitchMax'] },
    { title: 'Эквалайзер', keys: ['eqFrequencyMin', 'eqFrequencyMax', 'eqGainMin', 'eqGainMax'] },
    { title: 'Sample rate', keys: ['sampleRateMin', 'sampleRateMax'] },
  ],
  encode: [
    { title: 'CRF', keys: ['crfMin', 'crfMax'] },
    { title: 'GOP', keys: ['gopMin', 'gopMax'] },
  ],
};

export function getParamCount(params) {
  return params ? Object.keys(params).length : 0;
}
