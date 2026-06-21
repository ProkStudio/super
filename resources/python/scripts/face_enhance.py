#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Восстановление лиц через GFPGAN (меняет биометрическую текстуру).
"""

import argparse
import os
import subprocess
import sys
import tempfile

import cv2
import numpy as np

try:
    from gfpgan import GFPGANer
except ImportError:
    GFPGANer = None


def find_ffmpeg():
    for name in ("ffmpeg", "ffmpeg.exe"):
        try:
            subprocess.run([name, "-version"], capture_output=True, check=True)
            return name
        except (subprocess.CalledProcessError, FileNotFoundError):
            continue
    return "ffmpeg"


def process_video(input_path, output_path):
    if GFPGANer is None:
        print("ERROR: установите gfpgan: pip install gfpgan", file=sys.stderr)
        sys.exit(1)

    # Модель скачивается при первом запуске
    restorer = GFPGANer(
        model_path="https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth",
        upscale=1,
        arch="clean",
        channel_multiplier=2,
        bg_upsampler=None,
    )

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print("ERROR: не удалось открыть видео", file=sys.stderr)
        sys.exit(1)

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1

    tmp_video = tempfile.mktemp(suffix="_face_noaudio.mp4")
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(tmp_video, fourcc, fps, (w, h))

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        try:
            _, _, restored = restorer.enhance(
                frame, has_aligned=False, only_center_face=False, paste_back=True
            )
            if restored is not None:
                frame = restored
        except Exception as e:
            print(f"WARN кадр {frame_idx}: {e}", file=sys.stderr)
        out.write(frame)
        frame_idx += 1
        pct = min(99, int(100 * frame_idx / total))
        print(f"PROGRESS:{pct}", flush=True)

    cap.release()
    out.release()
    print("PROGRESS:99", flush=True)

    # Перенос аудио из исходника
    ffmpeg = find_ffmpeg()
    cmd = [
        ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
        "-i", tmp_video,
        "-i", input_path,
        "-map", "0:v:0",
        "-map", "1:a?",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "copy",
        "-shortest",
        output_path,
    ]
    subprocess.run(cmd, check=False)
    if not os.path.exists(output_path):
        os.replace(tmp_video, output_path)
    else:
        try:
            os.remove(tmp_video)
        except OSError:
            pass

    print("PROGRESS:100", flush=True)


def main():
    parser = argparse.ArgumentParser(description="Face enhance GFPGAN")
    parser.add_argument("input", help="Входное видео")
    parser.add_argument("output", help="Выходное видео")
    args = parser.parse_args()
    process_video(args.input, args.output)


if __name__ == "__main__":
    main()
