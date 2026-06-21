/**
 * Конфetti-анимация при завершении обработки.
 */
import confetti from 'canvas-confetti';

/** Запуск burst конфetti в киберпанк-цветах */
export function fireConfetti() {
  const colors = ['#00FFFF', '#FF00FF', '#00FF88', '#FFFFFF'];

  // Центральный burst
  confetti({
    particleCount: 120,
    spread: 80,
    origin: { y: 0.6 },
    colors,
    ticks: 200,
    gravity: 0.8,
    scalar: 1.1,
  });

  // Боковые salvo
  setTimeout(() => {
    confetti({
      particleCount: 60,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.65 },
      colors,
    });
    confetti({
      particleCount: 60,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.65 },
      colors,
    });
  }, 200);
}

export default function Confetti() {
  return null; // Логика через fireConfetti()
}
