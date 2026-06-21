#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Adversarial perturbation для ключевых кадров (FGSM / PGD).
Суррогат: MobileNetV3 или ResNet-50.
"""

import argparse
import sys

import cv2
import numpy as np
import torch
import torch.nn.functional as F
from torchvision import models

LEVEL_EPS = {"low": 2 / 255, "medium": 4 / 255, "high": 8 / 255}
FRAME_STEP = 10


def load_model(name: str, device):
    if name == "resnet50":
        m = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V1)
    else:
        m = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.IMAGENET1K_V1)
    m.eval().to(device)
    return m


def preprocess(frame_bgr, size=224):
    """BGR -> tensor [1,3,H,W] нормализованный под ImageNet."""
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    rgb = cv2.resize(rgb, (size, size))
    t = torch.from_numpy(rgb).float().permute(2, 0, 1) / 255.0
    mean = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1)
    std = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1)
    t = (t - mean) / std
    return t.unsqueeze(0)


def tensor_to_bgr(t, orig_h, orig_w):
    """Денормализация и resize обратно."""
    mean = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1)
    std = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1)
    x = t.squeeze(0).cpu() * std + mean
    x = x.clamp(0, 1).permute(1, 2, 0).numpy()
    x = (x * 255).astype(np.uint8)
    rgb = cv2.resize(x, (orig_w, orig_h))
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def fgsm_step(model, x0, label, eps):
    """Один шаг FGSM от x0."""
    xi = x0.detach().clone().requires_grad_(True)
    logits = model(xi)
    loss = F.cross_entropy(logits, label)
    loss.backward()
    if xi.grad is None:
        return x0
    return torch.clamp(x0 + eps * xi.grad.sign(), -3, 3).detach()


def pgd_attack(model, x0, label, eps, steps):
    """Projected Gradient Descent — на каждой итерации новый leaf-тензор."""
    alpha = eps / max(steps, 1)
    x_adv = x0.detach().clone()
    for _ in range(steps):
        xi = x_adv.detach().clone().requires_grad_(True)
        logits = model(xi)
        loss = F.cross_entropy(logits, label)
        loss.backward()
        if xi.grad is None:
            break
        x_adv = xi.detach() + alpha * xi.grad.sign()
        x_adv = torch.clamp(x_adv, x0 - eps, x0 + eps)
    return torch.clamp(x_adv, -3, 3).detach()


def attack_frame(model, x, label, eps, level, device):
    """FGSM для low, PGD для medium/high."""
    x0 = x.detach().to(device)
    if level == "low":
        return fgsm_step(model, x0, label, eps)
    steps = 10 if level == "high" else 5
    return pgd_attack(model, x0, label, eps, steps)


def process_video(input_path, output_path, level, model_name):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = load_model(model_name, device)
    eps = LEVEL_EPS.get(level, LEVEL_EPS["medium"])

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print("ERROR: не удалось открыть видео", file=sys.stderr)
        sys.exit(1)

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

    frame_idx = 0
    last_perturbed = None

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % FRAME_STEP == 0:
            x = preprocess(frame).to(device)
            with torch.no_grad():
                label = model(x).argmax(dim=1)
            x_adv = attack_frame(model, x, label, eps, level, device)
            perturbed = tensor_to_bgr(x_adv, h, w)
            last_perturbed = perturbed
            blend = 0.85
            frame = cv2.addWeighted(frame, 1 - blend, perturbed, blend, 0)
        elif last_perturbed is not None:
            blend = 0.85
            frame = cv2.addWeighted(frame, 1 - blend, last_perturbed, blend, 0)

        writer.write(frame)
        frame_idx += 1
        pct = min(99, int(100 * frame_idx / total))
        print(f"PROGRESS:{pct}", flush=True)

    cap.release()
    writer.release()
    print("PROGRESS:99", flush=True)
    mux_audio(input_path, output_path)
    print("PROGRESS:100", flush=True)


def mux_audio(input_path, output_path):
    """Склеивает видео с аудиодорожкой исходного файла через ffmpeg."""
    import os
    import subprocess
    import tempfile

    tmp = tempfile.mktemp(suffix="_adv_mux.mp4")
    ffmpeg = os.environ.get("FFMPEG_PATH", "ffmpeg")

    cmd = [
        ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
        "-i", output_path,
        "-i", input_path,
        "-map", "0:v:0",
        "-map", "1:a?",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "128k",
        "-shortest",
        tmp,
    ]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode == 0 and os.path.exists(tmp):
        os.replace(tmp, output_path)
    else:
        try:
            os.remove(tmp)
        except OSError:
            pass


def main():
    parser = argparse.ArgumentParser(description="Adversarial perturbation")
    parser.add_argument("input", help="Входное видео")
    parser.add_argument("output", help="Выходное видео")
    parser.add_argument("--level", choices=["low", "medium", "high"], default="medium")
    parser.add_argument("--model", choices=["resnet50", "mobilenet"], default="mobilenet")
    args = parser.parse_args()
    process_video(args.input, args.output, args.level, args.model)


if __name__ == "__main__":
    main()
