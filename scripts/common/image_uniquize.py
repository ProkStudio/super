"""Light image uniquization for channel avatars/banners (Truwas-style, not full uniquizer)."""
import os
import random
import shutil
import subprocess
import tempfile


def uniqualize_image(src, config=None):
    """Return path to a lightly modified copy of src (ffmpeg noise) or original on failure."""
    if not src or not os.path.isfile(src):
        return src
    config = config or {}
    ffmpeg = config.get('ffmpegPath') or 'ffmpeg'
    ext = os.path.splitext(src)[1] or '.jpg'
    dst = tempfile.mktemp(suffix=ext)
    noise = random.randint(1, 4)
    quality = random.randint(2, 6)
    try:
        proc = subprocess.run(
            [
                ffmpeg, '-y', '-hide_banner', '-loglevel', 'error',
                '-i', src,
                '-vf', f'noise=alls={noise}:allf=t',
                '-q:v', str(quality),
                dst,
            ],
            capture_output=True,
            timeout=120,
            check=False,
        )
        if proc.returncode == 0 and os.path.isfile(dst) and os.path.getsize(dst) > 0:
            return dst
    except Exception:
        pass
    try:
        shutil.copy2(src, dst)
        with open(dst, 'ab') as fh:
            fh.write(os.urandom(random.randint(8, 32)))
        return dst
    except Exception:
        return src
