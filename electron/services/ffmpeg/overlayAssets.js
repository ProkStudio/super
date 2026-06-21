/**
 * Движущиеся оверлеи через drawtext (без multi-input overlay — стабильнее для FFmpeg).
 */

const EMOJI_CHARS = ['*', '+', 'o', 'O', '#', '@', '%', '&'];
const TEXT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Возвращает массив drawtext-фильтров с движущимися символами.
 */
function generateOverlayDrawtexts(settings) {
  const count = Math.min(3, Math.max(1, Math.round(settings.overlayCount || randInt(1, 3))));
  const opacity = Math.min(0.5, Math.max(0.05, settings.overlayOpacity ?? rand(0.1, 0.25)));
  const speed = settings.overlaySpeed ?? randInt(50, 150);
  const parts = [];

  for (let i = 0; i < count; i++) {
    const ch = Math.random() < 0.5
      ? EMOJI_CHARS[randInt(0, EMOJI_CHARS.length - 1)]
      : TEXT_CHARS[randInt(0, TEXT_CHARS.length - 1)];
    const sp = speed + randInt(-20, 20);
    const phaseY = randInt(0, 200);
    const text = ch.replace(/'/g, '');
    const x = `mod(n*${sp}\\,w-tw)`;
    const y = `mod(n*${Math.max(1, Math.floor(sp / 2))}+${phaseY}\\,h-th)`;
    parts.push(
      `drawtext=text='${text}':fontsize=28:fontcolor=white@${opacity.toFixed(2)}:x='${x}':y='${y}'`
    );
  }

  return parts;
}

module.exports = { generateOverlayDrawtexts };
