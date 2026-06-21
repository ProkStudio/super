#!/usr/bin/env python3
"""Generate short joke warmup videos via FFmpeg."""
import glob
import os
import random
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common.utils import load_config, progress, result

JOKE_TEMPLATES = [
    'Почему программисты путают Halloween и Christmas? Because Oct 31 == Dec 25',
    '— Как дела? — NULL pointer exception',
    '404: шутка не найдена',
    'Программист — это машина для превращения кофе в код.',
    '— Сколько программистов нужно, чтобы вкрутить лампочку? — Ни одного, это аппаратная проблема.',
    'Git commit -m "fix" — и поехали снова.',
    'Работаю удалённо: дом, офис, холодильник.',
    'Документация? Она в голове у автора.',
]

IMAGE_EXTS = ('.jpg', '.jpeg', '.png', '.webp', '.bmp')
FONT_EXTS = ('.ttf', '.otf')
MUSIC_EXTS = ('.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac')


def _ffmpeg_candidates(config=None):
    paths = []
    if config and config.get('ffmpegPath'):
        paths.append(config['ffmpegPath'])
    env = os.environ.get('FFMPEG_PATH', '')
    if env:
        paths.append(env)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    resources_root = os.path.dirname(script_dir)
    for rel in (
        os.path.join(resources_root, 'resources', 'bin', 'win', 'ffmpeg.exe'),
        os.path.join(resources_root, 'resources', 'bin', 'win', 'ffmpeg'),
        os.path.join(resources_root, 'resources', 'bin', 'ffmpeg.exe'),
        os.path.join(resources_root, 'bin', 'win', 'ffmpeg.exe'),
        os.path.join(resources_root, 'bin', 'ffmpeg.exe'),
    ):
        paths.append(rel)

    dev_root = os.path.dirname(resources_root)
    for rel in (
        os.path.join(dev_root, 'resources', 'bin', 'win', 'ffmpeg.exe'),
        os.path.join(dev_root, 'Uniq', 'resources', 'bin', 'win', 'ffmpeg.exe'),
    ):
        paths.append(rel)

    paths.extend(('ffmpeg.exe', 'ffmpeg'))
    return paths


def find_ffmpeg(config=None):
    seen = set()
    for candidate in _ffmpeg_candidates(config):
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        if os.path.isfile(candidate):
            return candidate
        try:
            subprocess.run([candidate, '-version'], capture_output=True, check=True)
            return candidate
        except (FileNotFoundError, subprocess.CalledProcessError, OSError):
            continue
    return None


def list_media(folder, extensions):
    if not folder or not os.path.isdir(folder):
        return []
    files = []
    for name in os.listdir(folder):
        lower = name.lower()
        if any(lower.endswith(ext) for ext in extensions):
            files.append(os.path.join(folder, name))
    return sorted(files)


def ffmpeg_escape_path(path):
    if not path:
        return ''
    return path.replace('\\', '/').replace(':', '\\:')


def escape_drawtext(text):
    return (
        text.replace('\\', '\\\\')
        .replace("'", "\\'")
        .replace(':', '\\:')
        .replace('%', '\\%')
    )


def wrap_text(text, max_len=28):
    words = text.split()
    lines, current = [], ''
    for word in words:
        candidate = f'{current} {word}'.strip()
        if len(candidate) <= max_len:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return '\\n'.join(lines) if lines else text


def load_jokes(config):
    custom = config.get('jokeTexts') or config.get('customTexts') or []
    if isinstance(custom, str):
        lines = [line.strip() for line in custom.splitlines() if line.strip()]
    else:
        lines = [str(line).strip() for line in custom if str(line).strip()]
    if lines:
        return lines

    jokes_path = os.path.join(os.path.dirname(__file__), 'jokes.txt')
    if os.path.isfile(jokes_path):
        with open(jokes_path, 'r', encoding='utf-8') as f:
            items = [line.strip() for line in f if line.strip()]
            if items:
                return items
    return JOKE_TEMPLATES


def hex_to_ass_bgr(hex_color):
    """Convert #RRGGBB to ASS &HBBGGRR format."""
    raw = (hex_color or '#FFFFFF').strip().lstrip('#')
    if len(raw) == 3:
        raw = ''.join(ch * 2 for ch in raw)
    if len(raw) != 6:
        return '&H00FFFFFF'
    r, g, b = raw[0:2], raw[2:4], raw[4:6]
    return f'&H00{b.upper()}{g.upper()}{r.upper()}'


ASS_OVERLAY_NAME = 'overlay.ass'


def build_ass_content(joke, box_color='#000000', text_color='#FFFFFF', font_size=48):
    box = hex_to_ass_bgr(box_color)
    text = hex_to_ass_bgr(text_color)
    safe = joke.replace('\n', '\\N').replace('{', '\\{').replace('}', '\\}')
    return f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Box,Arial,10,{box},&H000000FF,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: Text,Arial,{font_size},{text},&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,5,30,30,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:05:00.00,Box,,0,0,0,,{{\\pos(540,960)}}{{\\p1}}m 0 0 l 1080 0 1080 1920 0 1920{{\\p0}}
Dialogue: 1,0:00:00.00,0:05:00.00,Text,,0,0,0,,{{\\pos(540,960)}}{safe}
"""


def build_video_ass(ffmpeg, joke, duration, output_path, photo=None, ass_path=None,
                    box_color='#000000', text_color='#FFFFFF', font_size=48):
    """Render video with ASS overlay. Uses a temp cwd so ass=overlay.ass works on Windows."""
    work_dir = tempfile.mkdtemp(prefix='techpro_joke_')
    try:
        overlay = os.path.join(work_dir, ASS_OVERLAY_NAME)
        if ass_path and os.path.isfile(ass_path):
            shutil.copy2(ass_path, overlay)
        else:
            with open(overlay, 'w', encoding='utf-8') as f:
                f.write(build_ass_content(joke, box_color, text_color, font_size))

        out_abs = os.path.abspath(output_path)
        ass_ref = ASS_OVERLAY_NAME
        if photo:
            vf = (
                f'scale=1080:1920:force_original_aspect_ratio=increase,'
                f'crop=1080:1920,ass={ass_ref}'
            )
            cmd = [
                ffmpeg, '-y',
                '-loop', '1', '-i', os.path.abspath(photo),
                '-t', str(duration),
                '-vf', vf,
                '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
                out_abs,
            ]
        else:
            color = f'#{random.randint(0x111111, 0x444444):06x}'
            vf = f"color=c={color}:s=1080x1920:d={duration},ass={ass_ref}"
            cmd = [
                ffmpeg, '-y',
                '-f', 'lavfi', '-i', vf,
                '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                out_abs,
            ]

        subprocess.run(cmd, capture_output=True, check=True, cwd=work_dir)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def build_video(ffmpeg, joke, duration, output_path, photo=None, font=None, use_ass=True,
                ass_box_color='#000000', ass_text_color='#FFFFFF', ass_font_size=48):
    if use_ass:
        return build_video_ass(
            ffmpeg, joke, duration, output_path, photo,
            box_color=ass_box_color, text_color=ass_text_color, font_size=ass_font_size,
        )
    text = escape_drawtext(wrap_text(joke))
    font_part = f"fontfile='{ffmpeg_escape_path(font)}':" if font else ''
    draw = (
        f"drawtext={font_part}text='{text}':fontsize=42:fontcolor=white:"
        f"borderw=2:bordercolor=black@0.6:"
        f"x=(w-text_w)/2:y=(h-text_h)/2:line_spacing=8"
    )

    if photo:
        vf = (
            f'scale=1080:1920:force_original_aspect_ratio=increase,'
            f'crop=1080:1920,{draw}'
        )
        cmd = [
            ffmpeg, '-y',
            '-loop', '1', '-i', photo,
            '-t', str(duration),
            '-vf', vf,
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
            output_path,
        ]
    else:
        color = f'#{random.randint(0x111111, 0x444444):06x}'
        cmd = [
            ffmpeg, '-y',
            '-f', 'lavfi', '-i', f'color=c={color}:s=1080x1920:d={duration}',
            '-vf', draw,
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
            output_path,
        ]

    subprocess.run(cmd, capture_output=True, check=True)


CHIPTUNE_SCALES = [
    [262, 294, 330, 349, 392, 440, 494],
    [220, 247, 277, 294, 330, 370, 415],
    [196, 220, 247, 262, 294, 330, 370],
]


def ffmpeg_error_text(stderr_bytes, limit=400):
    text = (stderr_bytes or b'').decode('utf-8', errors='replace')
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    skip = ('ffmpeg version', 'copyright', 'built with', 'configuration:', 'libavutil', 'libavcodec')
    useful = [ln for ln in lines if not any(s in ln.lower() for s in skip)]
    if useful:
        return '\n'.join(useful[-6:])[:limit]
    return text[-limit:]


def generate_chiptune(ffmpeg, out_path, duration, volume):
    """Random 8-bit melody via FFmpeg lavfi (Truwas-style fallback)."""
    vol = max(0, min(100, int(volume))) / 100.0
    duration = float(duration)
    scale = random.choice(CHIPTUNE_SCALES)
    note_dur = random.uniform(0.12, 0.28)

    notes = []
    elapsed = 0.0
    while elapsed < duration - 0.05:
        nd = min(note_dur * random.uniform(0.75, 1.25), duration - elapsed)
        notes.append((random.choice(scale), nd))
        elapsed += nd
    if not notes:
        notes = [(random.choice(scale), duration)]

    cmd = [ffmpeg, '-y']
    for freq, nd in notes:
        cmd.extend([
            '-f', 'lavfi', '-i',
            f'sine=frequency={freq}:duration={nd:.4f}:sample_rate=44100',
        ])

    streams = ''.join(f'[{i}:a]' for i in range(len(notes)))
    fc = (
        f'{streams}concat=n={len(notes)}:v=0:a=1[raw];'
        f'[raw]volume={vol:.3f},lowpass=f=2500,highpass=f=180,alimiter=limit=0.9[a]'
    )
    cmd.extend([
        '-filter_complex', fc,
        '-map', '[a]',
        '-t', str(duration),
        '-c:a', 'pcm_s16le',
        out_path,
    ])
    subprocess.run(cmd, capture_output=True, check=True)


def pick_music_track(music_files, music_chance):
    """Return custom track path or None (use chiptune)."""
    if not music_files:
        return None
    chance = max(0, min(100, int(music_chance or 50)))
    if random.randint(1, 100) <= chance:
        return random.choice(music_files)
    return None


def add_music(ffmpeg, video_path, music_path, volume, duration):
    vol = max(0.0, min(1.0, volume / 100.0))
    temp = video_path + '.tmp.mp4'
    cmd = [
        ffmpeg, '-y',
        '-i', video_path,
        '-i', music_path,
        '-t', str(duration),
        '-filter_complex', f'[1:a]volume={vol}[a]',
        '-map', '0:v', '-map', '[a]',
        '-c:v', 'copy', '-c:a', 'aac', '-shortest',
        temp,
    ]
    subprocess.run(cmd, capture_output=True, check=True)
    os.replace(temp, video_path)


def main():
    config = load_config()
    count = int(config.get('count') or config.get('videoCount') or 10)
    duration = float(config.get('duration') or 5)
    music_volume = int(config.get('musicVolume') or 30)
    music_chance = int(config.get('musicChance') or 50)
    output_dir = config.get('outputDir') or os.path.join(os.path.expanduser('~'), 'nexus-jokes')
    photos_folder = config.get('photosFolder') or ''
    fonts_folder = config.get('fontsFolder') or ''
    music_folder = config.get('musicFolder') or ''

    use_ass = config.get('useAss', True)
    ass_box_color = config.get('assBoxColor') or '#000000'
    ass_text_color = config.get('assTextColor') or '#FFFFFF'
    ass_font_size = int(config.get('assFontSize') or 48)
    text_variants = config.get('textVariants') or []

    os.makedirs(output_dir, exist_ok=True)
    ffmpeg = find_ffmpeg(config)
    if not ffmpeg:
        msg = (
            'FFmpeg не найден. Установите FFmpeg и добавьте в PATH, '
            'или положите ffmpeg.exe в resources/bin/win/'
        )
        progress('joke', 100, msg)
        result({'ok': False, 'error': msg})
        sys.exit(1)

    jokes = load_jokes(config)
    photos = list_media(photos_folder, IMAGE_EXTS)
    fonts = list_media(fonts_folder, FONT_EXTS)
    music_files = list_media(music_folder, MUSIC_EXTS)

    progress('joke', 0, f'Старт: {count} видео, {duration}с')
    progress('joke', 0, f'FFmpeg: {ffmpeg}')
    progress('joke', 0, f'Текстов: {len(jokes)}')
    if photos:
        progress('joke', 0, f'Фото: {len(photos)} файлов')
    if fonts:
        progress('joke', 0, f'Шрифты: {len(fonts)} файлов')
    if music_files:
        progress('joke', 0, f'Музыка: {len(music_files)} треков, шанс своей {music_chance}%')
    elif music_folder:
        progress('joke', 0, 'Папка музыки пуста — будет 8-bit')
    else:
        progress('joke', 0, 'Своя музыка не указана — 8-bit мелодия на каждое видео')

    created = 0
    for i in range(count):
        if text_variants:
            variant = text_variants[i % len(text_variants)]
            top = (variant.get('top') or '').strip()
            bottom = (variant.get('bottom') or '').strip()
            joke = '\n'.join(x for x in (top, bottom) if x) or jokes[i % len(jokes)]
        else:
            joke = jokes[i % len(jokes)]
        photo = random.choice(photos) if photos else None
        font = random.choice(fonts) if fonts else None
        music = pick_music_track(music_files, music_chance) if music_files else None
        out = os.path.join(output_dir, f'joke_{i + 1:03d}.mp4')

        pct = int((i / count) * 100)
        progress('joke', pct, f'[{i + 1}/{count}] Генерация…')

        try:
            build_video(
                ffmpeg, joke, duration, out, photo, font,
                use_ass=use_ass,
                ass_box_color=ass_box_color,
                ass_text_color=ass_text_color,
                ass_font_size=ass_font_size,
            )
            if music:
                add_music(ffmpeg, out, music, music_volume, duration)
            else:
                chip = out + '.chip.wav'
                try:
                    generate_chiptune(ffmpeg, chip, duration, music_volume)
                    add_music(ffmpeg, out, chip, 100, duration)
                    progress('joke', int(((i + 0.9) / count) * 100), '8-bit мелодия добавлена')
                finally:
                    if os.path.isfile(chip):
                        os.remove(chip)
            created += 1
            progress('joke', int(((i + 1) / count) * 100), f'Готово: {os.path.basename(out)}')
        except FileNotFoundError:
            progress('joke', int(((i + 0.5) / count) * 100), 'FFmpeg не найден при запуске')
            break
        except subprocess.CalledProcessError as e:
            err = ffmpeg_error_text(e.stderr)
            progress('joke', int(((i + 0.5) / count) * 100), f'Ошибка FFmpeg: {err}')
        except Exception as e:
            progress('joke', int(((i + 0.5) / count) * 100), f'Ошибка: {e}')

    progress('joke', 100, f'Завершено: {created}/{count} видео → {output_dir}')
    result({'ok': created > 0, 'outputDir': output_dir, 'count': created, 'total': count})


if __name__ == '__main__':
    main()
