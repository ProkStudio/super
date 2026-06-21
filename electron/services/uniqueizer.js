/**
 * Uniqueizer — full FFmpeg + Python pipeline (ported from VideoUniquer Pro).
 */
const { ProcessingManager } = require('./ffmpeg/processor');

const processor = new ProcessingManager();

module.exports = { processor, ProcessingManager };
