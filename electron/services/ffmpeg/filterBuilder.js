/**
 * Построение filter_complex — безопасный порядок фильтров для FFmpeg.
 */

const path = require('path');
const { generateOverlayDrawtexts } = require('./overlayAssets');

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function even(n) {
  return Math.max(2, Math.floor(n / 2) * 2);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escDrawtext(s) {
  return s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function buildAtempoChain(speed) {
  const filters = [];
  let remaining = speed;
  while (remaining > 2.0) {
    filters.push('atempo=2.0');
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  if (Math.abs(remaining - 1.0) > 0.001) {
    filters.push(`atempo=${remaining.toFixed(4)}`);
  }
  return filters;
}

/** Безопасный порядок: геометрия → пиксели → время → текст → fade */
const SAFE_VIDEO_ORDER = [
  'crop', 'rotate', 'hflip', 'resample', 'color', 'noise',
  'vignette', 'blur', 'fpsJitter', 'speed', 'movingOverlay', 'watermark', 'fade',
];

let metaSpeed = 1.0;
let metaPtsMul = 1.0;

const videoFilters = {
  crop(settings) {
    const maxPct = settings.cropMaxPct / 100;
    const lp = rand(0, maxPct);
    const rp = rand(0, maxPct);
    const tp = rand(0, maxPct);
    const bp = rand(0, maxPct);
    const wp = (1 - lp - rp).toFixed(4);
    const hp = (1 - tp - bp).toFixed(4);
    return `crop=trunc(iw*${wp}/2)*2:trunc(ih*${hp}/2)*2:trunc(iw*${lp.toFixed(4)}/2)*2:trunc(ih*${tp.toFixed(4)}/2)*2`;
  },

  rotate(settings) {
    const maxDeg = settings.rotateMaxDeg ?? 2;
    const angleRad = (rand(-maxDeg, maxDeg) * Math.PI) / 180;
    return [
      `rotate=${angleRad.toFixed(6)}:fillcolor=black@0`,
      'crop=trunc(iw/2)*2:trunc(ih/2)*2:(iw-ow)/2:(ih-oh)/2',
    ];
  },

  hflip() {
    return 'hflip';
  },

  speed(settings) {
    metaSpeed = rand(settings.speedMin, settings.speedMax);
    return null;
  },

  color(settings, _meta, effectDetails) {
    const balMax = settings.colorBalanceMax ?? 0.08;
    const rs = rand(-balMax, balMax).toFixed(3);
    const gs = rand(-balMax, balMax).toFixed(3);
    const bs = rand(-balMax, balMax).toFixed(3);
    const br = rand(settings.brightnessMin ?? -0.06, settings.brightnessMax ?? 0.06).toFixed(3);
    const co = rand(settings.contrastMin ?? 0.92, settings.contrastMax ?? 1.1).toFixed(3);
    const sa = rand(settings.saturationMin ?? 0.92, settings.saturationMax ?? 1.08).toFixed(3);
    const hue = rand(settings.hueMin ?? -5, settings.hueMax ?? 5).toFixed(1);
    if (effectDetails) {
      effectDetails.color = {
        brightness: parseFloat(br),
        contrast: parseFloat(co),
        saturation: parseFloat(sa),
        hue: parseFloat(hue),
        balance: { rs: parseFloat(rs), gs: parseFloat(gs), bs: parseFloat(bs) },
      };
    }
    return [
      `colorbalance=rs=${rs}:gs=${gs}:bs=${bs}`,
      `eq=brightness=${br}:contrast=${co}:saturation=${sa}`,
      `hue=h=${hue}`,
    ];
  },

  noise(settings) {
    const amp = randInt(settings.noiseMin ?? 5, settings.noiseMax ?? 15);
    return `noise=alls=${amp}:allf=t+u`;
  },

  vignette() {
    return 'vignette=angle=PI/4';
  },

  blur(settings) {
    const sigma = rand(settings.blurSigmaMin, settings.blurSigmaMax);
    if (Math.random() < 0.5) {
      const amount = sigma.toFixed(2);
      return `unsharp=luma_amount=${amount}:chroma_amount=${amount}`;
    }
    return `smartblur=lr=${sigma.toFixed(2)}:ls=-0.5`;
  },

  resample(settings) {
    const scale = rand(settings.resampleMin, settings.resampleMax);
    const sw = scale.toFixed(4);
    return [
      `scale=trunc(iw*${sw}/2)*2:trunc(ih*${sw}/2)*2`,
      'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=bilinear',
    ];
  },

  watermark() {
    const now = new Date();
    const text = escDrawtext(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`
    );
    const corners = [
      ['10', '10'],
      ['w-tw-10', '10'],
      ['10', 'h-th-10'],
      ['w-tw-10', 'h-th-10'],
    ];
    const [x, y] = corners[randInt(0, corners.length - 1)];
    return `drawtext=text='${text}':x=${x}:y=${y}:fontsize=18:fontcolor=cyan@0.35`;
  },

  fade(settings, meta) {
    const fd = rand(settings.fadeMin ?? 0.2, settings.fadeMax ?? 0.5);
    const dur = meta.duration || 10;
    const stOut = Math.max(0, dur - fd);
    return [
      `fade=t=in:st=0:d=${fd.toFixed(3)}`,
      `fade=t=out:st=${stOut.toFixed(3)}:d=${fd.toFixed(3)}`,
    ];
  },

  fpsJitter(settings, meta) {
    const fps = meta.fps || 30;
    const target = fps > 29.5 && fps < 30.5 ? '30000/1001' : '30';
    metaPtsMul = settings.fpsJitterPts ?? 1.001;
    return `fps=${target}`;
  },

  movingOverlay(settings) {
    return generateOverlayDrawtexts(settings);
  },
};

const COMMON_SAMPLE_RATES = [44100, 48000];

function pickSampleRate(min, max, sourceRate) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  let candidates = COMMON_SAMPLE_RATES.filter((r) => r >= lo && r <= hi);
  if (sourceRate) {
    const different = candidates.filter((r) => r !== sourceRate);
    if (different.length) candidates = different;
  }
  if (candidates.length > 0) {
    return candidates[randInt(0, candidates.length - 1)];
  }
  return sourceRate === 48000 ? 44100 : 48000;
}

const audioFilters = {
  speed(settings) {
    const factor = metaSpeed || rand(settings.speedMin, settings.speedMax);
    return buildAtempoChain(factor);
  },

  audio(settings, meta, effectDetails) {
    const parts = [];
    const baseRate = meta?.sampleRate || 48000;

    const pitch = rand(settings.pitchMin ?? 0.98, settings.pitchMax ?? 1.02);
    if (Math.abs(pitch - 1.0) > 0.0005) {
      const shiftedRate = Math.round(baseRate * pitch);
      parts.push(`asetrate=${shiftedRate},aresample=${baseRate},atempo=${(1 / pitch).toFixed(4)}`);
    }

    const eqFreq = Math.round(rand(settings.eqFrequencyMin ?? 800, settings.eqFrequencyMax ?? 3000));
    const eqGain = rand(settings.eqGainMin ?? -2, settings.eqGainMax ?? 2).toFixed(1);
    parts.push(`equalizer=f=${eqFreq}:width_type=o:width=200:g=${eqGain}`);

    const outRate = pickSampleRate(
      settings.sampleRateMin ?? 44100,
      settings.sampleRateMax ?? 48000,
      baseRate,
    );
    parts.push(`aresample=${outRate}`);

    const vol = rand(settings.volumeMin ?? 0.89, settings.volumeMax ?? 1.12).toFixed(3);
    parts.push(`volume=${vol}`);

    const delayMax = settings.audioDelayMax ?? 100;
    const delayMs = Math.round(rand(-delayMax, delayMax));
    if (delayMs > 0) {
      parts.push(`adelay=${delayMs}|${delayMs}`);
    } else if (delayMs < 0) {
      parts.push(`atrim=start=${(-delayMs / 1000).toFixed(3)}`);
      parts.push('asetpts=PTS-STARTPTS');
    }

    if (effectDetails) {
      effectDetails.audio = {
        pitch: parseFloat(pitch.toFixed(4)),
        eqHz: eqFreq,
        eqGainDb: parseFloat(eqGain),
        sampleRate: outRate,
        sourceSampleRate: baseRate,
        volume: parseFloat(vol),
        delayMs,
      };
    }
    return parts;
  },
};

const IMAGE_SKIP = new Set([
  'speed', 'trim', 'fade', 'audio', 'remux', 'movingOverlay', 'fpsJitter',
]);

/** trim через -ss на входе (не filter trim — он ломает граф) */
function getInputSeek(settings, meta, isImage) {
  if (isImage || !settings.enabledMethods.trim) return 0;
  const frames = randInt(settings.trimFramesMin ?? 1, settings.trimFramesMax ?? 3);
  return frames / (meta.fps || 24);
}

function buildFilterPlan(settings, meta, _overlayTmpDir) {
  metaSpeed = 1.0;
  metaPtsMul = 1.0;
  const isImage = !!meta.isImage;
  const inputSeek = getInputSeek(settings, meta, isImage);

  const videoParts = [];
  const audioParts = [];
  const appliedMethods = [];
  const effectDetails = {};

  if (inputSeek > 0) appliedMethods.push('trim');

  const shuffleable = SAFE_VIDEO_ORDER.filter(
    (m) => m !== 'crop' && m !== 'fade' && m !== 'speed' && m !== 'fpsJitter'
  );
  const middleMethods = shuffle(shuffleable);
  const headMethods = settings.enabledMethods.crop ? ['crop'] : [];
  const tailMethods = ['fpsJitter', 'speed', 'fade'];

  for (const method of [...headMethods, ...middleMethods, ...tailMethods]) {
    if (!settings.enabledMethods[method]) continue;
    if (isImage && IMAGE_SKIP.has(method)) continue;

    if (videoFilters[method]) {
      const detailsArg = method === 'color' ? effectDetails : undefined;
      const result = videoFilters[method](settings, meta, detailsArg);
      if (result === null) {
        if (method === 'speed' && metaSpeed !== 1.0) appliedMethods.push('speed');
        continue;
      }
      const parts = Array.isArray(result) ? result : [result];
      videoParts.push(...parts);
      if (method !== 'speed') appliedMethods.push(method);
    }
  }

  if (metaSpeed !== 1.0 && !appliedMethods.includes('speed')) {
    appliedMethods.push('speed');
  }
  if (metaPtsMul !== 1.0 && settings.enabledMethods.fpsJitter && !appliedMethods.includes('fpsJitter')) {
    appliedMethods.push('fpsJitter');
  }

  const combinedPts = (metaPtsMul / metaSpeed).toFixed(6);
  if (Math.abs(combinedPts - 1.0) > 0.0001) {
    videoParts.push(`setpts=PTS*${combinedPts}`);
  }

  if (meta.hasAudio) {
    if (settings.enabledMethods.speed && metaSpeed !== 1.0) {
      audioParts.push(...audioFilters.speed(settings));
    }
    if (settings.enabledMethods.audio) {
      audioParts.push(...audioFilters.audio(settings, meta, effectDetails));
      appliedMethods.push('audio');
    }
  }

  const encodeOpts = { isImage };
  if (isImage) {
    if (settings.enabledMethods.encode) {
      encodeOpts.jpegQuality = randInt(2, 8);
      encodeOpts.pngLevel = randInt(1, 9);
      appliedMethods.push('encode');
    } else {
      encodeOpts.jpegQuality = 4;
      encodeOpts.pngLevel = 6;
    }
  } else if (settings.enabledMethods.encode) {
    encodeOpts.crf = randInt(settings.crfMin, settings.crfMax);
    encodeOpts.gop = randInt(settings.gopMin ?? 24, settings.gopMax ?? 120);
    appliedMethods.push('encode');
  } else {
    encodeOpts.crf = 23;
    encodeOpts.gop = 48;
  }

  videoParts.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');

  let filterComplex = '';
  if (!isImage && videoParts.length > 0) {
    filterComplex = `[0:v]${videoParts.join(',')}[vout]`;
  }
  if (audioParts.length > 0 && meta.hasAudio) {
    if (filterComplex) filterComplex += ';';
    filterComplex += `[0:a]${audioParts.join(',')}[aout]`;
  }

  return {
    filterComplex,
    vfChain: videoParts.join(','),
    encodeOpts,
    appliedMethods,
    effectDetails,
    hasWatermark: appliedMethods.includes('watermark'),
    overlayInputs: [],
    inputSeek,
  };
}

function buildFfmpegArgs(inputPath, outputPath, plan, meta, opts = {}) {
  // info — иначе FFmpeg не шлёт time= в stderr и прогресс замирает на 0%
  const args = ['-y', '-hide_banner', '-loglevel', 'info'];
  const threads = opts.threads || 0;
  if (threads > 0) {
    args.push('-threads', String(threads));
    args.push('-filter_threads', String(Math.max(1, Math.ceil(threads / 2))));
  }

  if (plan.inputSeek > 0) {
    args.push('-ss', plan.inputSeek.toFixed(6));
  }

  args.push('-i', inputPath);

  if (meta.isImage) {
    if (plan.vfChain) args.push('-vf', plan.vfChain);
    args.push('-frames:v', '1', '-update', '1');
    if (outputPath.toLowerCase().endsWith('.png')) {
      args.push('-c:v', 'png', '-compression_level', String(plan.encodeOpts.pngLevel || 6));
    } else {
      args.push('-q:v', String(plan.encodeOpts.jpegQuality || 4));
    }
    args.push(outputPath);
    return args;
  }

  if (plan.filterComplex) {
    args.push('-filter_complex', plan.filterComplex);
    args.push('-map', '[vout]');
    if (plan.filterComplex.includes('[aout]')) {
      args.push('-map', '[aout]');
    } else if (meta.hasAudio) {
      args.push('-map', '0:a');
    }
  } else {
    args.push('-map', '0:v');
    if (meta.hasAudio) args.push('-map', '0:a');
  }

  args.push(
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', String(plan.encodeOpts.crf),
    '-g', String(plan.encodeOpts.gop),
    '-pix_fmt', 'yuv420p',
  );
  if (meta.hasAudio) {
    args.push('-c:a', 'aac', '-b:a', '128k');
  }
  args.push('-movflags', '+faststart', outputPath);
  return args;
}

function stripMovingOverlay(plan, settings, meta) {
  const noOverlay = {
    ...settings,
    enabledMethods: { ...settings.enabledMethods, movingOverlay: false },
  };
  return buildFilterPlan(noOverlay, meta, null);
}

function stripWatermark(plan, settings, meta) {
  const noWm = {
    ...settings,
    enabledMethods: { ...settings.enabledMethods, watermark: false },
  };
  return buildFilterPlan(noWm, meta, null);
}

module.exports = {
  buildFilterPlan,
  buildFfmpegArgs,
  stripWatermark,
  stripMovingOverlay,
  shuffle,
};
