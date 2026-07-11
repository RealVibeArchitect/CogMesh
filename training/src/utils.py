# SPDX-License-Identifier: AGPL-3.0-or-later
# CogMesh — © 2026 심태양 (Shim Taeyang).
# Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
# (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
# herein are original works of the author (see the CogMesh Technical Whitepaper).
# This program is free software: redistribute/modify under the AGPL; it comes with
# NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
# offer its complete source to users.

"""
Shared utilities — reproducibility (seeds), evaluation metrics, checkpoint loading.

Shared by train.py / infer.py / serve.py / export_onnx.py.
"""

import os
import sys
import random
import numpy as np
import torch


# ── the 20 core emotions (same as the web app src/core/pad/) ──────────────
CORE_EMOTIONS = [
    ("elated", "환희", 1.0, 0.7, 0.8), ("serene", "평온", 0.6, -0.6, 0.4),
    ("proud", "자신감", 0.7, 0.3, 1.0), ("excited", "흥분", 0.8, 0.1, 0.5),
    ("relieved", "안도", 0.5, -0.5, 0.3), ("grateful", "감사", 0.9, -0.2, 0.2),
    ("optimistic", "낙관", 0.7, 0.3, 0.6), ("awe", "경외", 0.8, 0.4, -0.2),
    ("curious", "호기심", 0.4, 0.6, 0.2), ("angry", "분노", -0.8, 0.9, 0.4),
    ("lethargic", "무기력", -0.6, -0.9, -0.8), ("ashamed", "수치심", -0.7, -0.2, -0.1),
    ("sad", "슬픔", -0.8, -0.4, -0.6), ("disgust", "혐오", -0.9, 0.2, 0.1),
    ("tense", "긴장", -0.2, 0.8, -0.3), ("puzzled", "당혹", -0.1, 0.5, -0.2),
    ("bored", "지루함", -0.3, -0.7, -0.2), ("envy", "질투", -0.6, 0.4, -0.5),
    ("panic", "공포", -0.9, 1.0, -0.7), ("vigilant", "경계", -0.2, 0.6, 0.3),
]
EMERGENCE_THRESHOLD = 0.55  # this far from any core → an 'emergence' candidate


def seed_everything(seed: int = 42):
    """Fix all RNG seeds for reproducibility."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def device_report():
    """Detect the available device and print info.

    Returns:
        (device, vram_gib): device is 'cuda' or 'cpu'; vram_gib is the detected
        GPU memory in GiB (float), or 0.0 on CPU. The VRAM figure lets callers
        auto-tune batch size / memory options for *any* GPU (see auto_tune()).
    """
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[device] {device}")
    if device == "cuda":
        name = torch.cuda.get_device_name(0)
        vram = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
        print(f"[device] GPU: {name}  |  VRAM: {vram:.1f} GiB")
        return device, vram
    print("[device] ⚠️ no CUDA — running on CPU (slow). GPU recommended for training.")
    return device, 0.0


# VRAM tiers (GiB) → recommended training knobs. Conservative on purpose so a
# fresh clone trains without OOM on whatever card it lands on. Users can always
# override any of these in their YAML config.
_VRAM_TIERS = [
    # (min_gib, batch_size, max_length, grad_accum, grad_checkpoint, note)
    (0.0,  2,  48,  8, True,  "very low VRAM / CPU — tiny batches, checkpointing on"),
    (6.0,  8,  64,  2, False, "≈6GB (e.g. laptop RTX) — the original safe profile"),
    (10.0, 16, 96,  1, False, "≈10–12GB — comfortable mid-range"),
    (16.0, 32, 128, 1, False, "≈16–24GB — large batches"),
    (32.0, 64, 192, 1, False, "32GB+ (A100/H100 class) — very large batches"),
]


def auto_tune(vram_gib, base_cfg=None):
    """Pick sensible training knobs for the detected VRAM.

    Any value already set in base_cfg['train'] is respected (explicit user choice
    wins); auto only fills in what's missing. This is what makes the project
    GPU-agnostic: clone it, run it, and it adapts to the card you have.
    """
    tier = _VRAM_TIERS[0]
    for t in _VRAM_TIERS:
        if vram_gib >= t[0]:
            tier = t
    _, bs, max_len, ga, gc, note = tier

    recommended = {
        "batch_size": bs,
        "max_length": max_len,
        "grad_accum": ga,
        "grad_checkpoint": gc,
    }
    print(f"[auto-tune] VRAM {vram_gib:.1f} GiB → {note}")
    print(f"[auto-tune] suggested: batch_size={bs}, max_length={max_len}, "
          f"grad_accum={ga}, grad_checkpoint={gc}")

    # explicit config values override the auto suggestion
    if base_cfg:
        user_train = base_cfg.get("train", {}) or {}
        user_data = base_cfg.get("data", {}) or {}
        for k in ("batch_size", "grad_accum", "grad_checkpoint"):
            if k in user_train:
                recommended[k] = user_train[k]
        if "max_length" in user_data:
            recommended["max_length"] = user_data["max_length"]
    return recommended


def count_params(model):
    """Count trainable / total parameters."""
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    return trainable, total


@torch.no_grad()
def pad_metrics(preds: torch.Tensor, targets: torch.Tensor) -> dict:
    """
    PAD regression evaluation metrics.
      - mae:            overall mean absolute error
      - mae_p/a/d:      per-axis mean absolute error (diagnose which axis is weak)
      - within_0.2:     fraction of coords with |error|<0.2 (intuitive accuracy)
    preds/targets: (N, 3) tensors.
    """
    err = (preds - targets).abs()
    return {
        "mae": err.mean().item(),
        "mae_p": err[:, 0].mean().item(),
        "mae_a": err[:, 1].mean().item(),
        "mae_d": err[:, 2].mean().item(),
        "within_0.2": (err < 0.2).float().mean().item(),
    }


def nearest_emotion(p, a, d):
    """Return the core emotion nearest to (p,a,d) and the distance."""
    best, best_dist = None, 1e9
    for eid, ko, ep, ea, ed in CORE_EMOTIONS:
        dist = ((p - ep) ** 2 + (a - ea) ** 2 + (d - ed) ** 2) ** 0.5
        if dist < best_dist:
            best_dist, best = dist, (ko, eid)
    return best, best_dist


class EarlyStopper:
    """Signal to stop if the val metric does not improve for `patience` epochs."""

    def __init__(self, patience: int = 6, min_delta: float = 1e-4):
        self.patience = patience
        self.min_delta = min_delta
        self.best = float("inf")
        self.count = 0

    def step(self, value: float) -> bool:
        if value < self.best - self.min_delta:
            self.best = value
            self.count = 0
            return False
        self.count += 1
        return self.count >= self.patience


def load_encoder_from_checkpoint(checkpoint_path: str, device: str = "cpu"):
    """
    Restore (model, tokenizer, config) from a checkpoint.
    A single entry point shared by infer / serve / export.
    """
    from transformers import AutoTokenizer
    # add src to the import path
    here = os.path.dirname(os.path.abspath(__file__))
    if here not in sys.path:
        sys.path.insert(0, here)
    from model import build_model  # noqa: E402

    ckpt = torch.load(checkpoint_path, map_location=device)
    cfg = ckpt["config"]
    base_name = cfg["model"]["base_model_name"]

    tokenizer = AutoTokenizer.from_pretrained(base_name)
    model = build_model(cfg).to(device)
    model.load_state_dict(ckpt["model_state"])
    model.eval()
    return model, tokenizer, cfg
