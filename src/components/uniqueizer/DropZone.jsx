/**
 * Зона drag & drop с частицами по периметру.
 * Поддерживает одно или несколько видео (пакетный режим).
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function ParticleCanvas({ active }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const particles = Array.from({ length: 30 }, () => ({
      t: Math.random(),
      speed: 0.001 + Math.random() * 0.003,
      size: 1 + Math.random() * 2,
      color: Math.random() > 0.5 ? '#00FFFF' : '#FF00FF',
      alpha: 0.3 + Math.random() * 0.7,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;
      const perimeter = 2 * (w + h);

      particles.forEach((p) => {
        if (active) p.t = (p.t + p.speed) % 1;
        const dist = p.t * perimeter;
        let x, y;
        if (dist < w) { x = dist; y = 0; }
        else if (dist < w + h) { x = w; y = dist - w; }
        else if (dist < 2 * w + h) { x = w - (dist - w - h); y = h; }
        else { x = 0; y = h - (dist - 2 * w - h); }

        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = active ? p.alpha : p.alpha * 0.3;
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none rounded-xl"
    />
  );
}

const MEDIA_EXT = /\.(mp4|mkv|avi|mov|webm|flv|wmv|m4v|ts|mts|jpe?g|png|webp|bmp|gif|tiff?|heic|heif)$/i;

export default function DropZone({ videos, batchMode, onFilesSelected, disabled }) {
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);

  const resolveFilePath = useCallback((file) => {
    if (!file) return null;
    try {
      return window.nexusAPI?.getPathForFile?.(file) || file.path || null;
    } catch {
      return file.path || null;
    }
  }, []);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragOver(false);
    if (disabled) return;

    const files = Array.from(e.dataTransfer.files || []);
    const paths = files
      .map(resolveFilePath)
      .filter((p) => p && MEDIA_EXT.test(p));

    if (!paths.length) {
      onFilesSelected([], 'Выберите видео или фото (mp4, jpg, png и др.)');
      return;
    }

    if (!batchMode && paths.length > 1) {
      onFilesSelected([paths[0]]);
      return;
    }

    onFilesSelected(batchMode ? paths : [paths[0]]);
  }, [disabled, batchMode, onFilesSelected, resolveFilePath]);

  const handleClick = async () => {
    if (disabled) return;
    if (batchMode) {
      const paths = await window.nexusAPI?.selectUniqueizerVideos?.();
      if (paths?.length) onFilesSelected(paths);
    } else {
      const p = await window.nexusAPI?.selectUniqueizerVideo?.();
      if (p) onFilesSelected([p]);
    }
  };

  const hasVideos = videos.length > 0;

  return (
    <motion.div
      onDragEnter={handleDragEnter}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      whileHover={disabled ? {} : { scale: 1.01 }}
      whileTap={disabled ? {} : { scale: 0.99 }}
      className={`
        relative rounded-xl border-2 border-dashed p-6 cursor-pointer transition-all duration-300 min-h-[160px]
        ${dragOver
          ? 'border-cyber-magenta bg-cyber-magenta/5 shadow-neon-magenta'
          : 'border-cyber-cyan/40 bg-cyber-card/50 hover:border-cyber-cyan/70 hover:shadow-neon-cyan'}
        ${disabled ? 'opacity-50 pointer-events-none' : ''}
      `}
    >
      <ParticleCanvas active={dragOver || hasVideos} />

      <div className="relative z-10 text-center">
        {hasVideos ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={videos.map((v) => v.path).join('|')}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2"
            >
              {batchMode && videos.length > 1 ? (
                <>
                  <div className="text-cyber-cyan font-medium">
                    {videos.length} видео в очереди
                  </div>
                  <div className="max-h-24 overflow-y-auto text-left space-y-1 px-2">
                    {videos.map((v) => (
                      <div key={v.path} className="text-xs text-cyber-dim truncate font-mono">
                        • {v.isImage ? '🖼 ' : '🎬 '}{v.name}
                        <span className="text-cyber-dim/60 ml-2">{v.resolution}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
              <div className="text-cyber-cyan font-medium truncate">
                {videos[0].mediaLabel && (
                  <span className="text-cyber-magenta text-xs mr-2">{videos[0].mediaLabel}</span>
                )}
                {videos[0].name}
              </div>
              <div className="flex justify-center gap-4 text-xs text-cyber-dim flex-wrap">
                <span>{videos[0].sizeFormatted}</span>
                {!videos[0].isImage && <span>{videos[0].durationFormatted}</span>}
                <span>{videos[0].resolution}</span>
              </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="space-y-2">
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-3xl"
            >
              📁
            </motion.div>
            <p className="text-cyber-cyan font-medium">
              {batchMode ? 'Перетащите видео/фото (несколько)' : 'Перетащите видео или фото'}
            </p>
            <p className="text-xs text-cyber-dim">
              {batchMode ? 'или выберите несколько файлов' : 'jpg, png, mp4, mkv…'}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
