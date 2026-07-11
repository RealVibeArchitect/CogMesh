# SPDX-License-Identifier: AGPL-3.0-or-later
# CogMesh — © 2026 심태양 (Shim Taeyang).
# Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
# (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
# herein are original works of the author (see the CogMesh Technical Whitepaper).
# This program is free software: redistribute/modify under the AGPL; it comes with
# NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
# offer its complete source to users.

"""
PAD Encoder training script — runs for real on an RTX 4050 (6GB).

Usage:
    python scripts/train.py --config configs/auto.yaml
    python scripts/train.py --config configs/auto.yaml --resume checkpoints/pad_encoder_last.pt

6GB-VRAM optimizations:
    - LoRA (train adapters only)
    - mixed precision (torch.amp) → half the memory
    - gradient accumulation → big-batch effect with small batches
    - gradient checkpointing (optional) → extra memory savings
    - small max_length (64 tokens)

Improvements in this version:
    - latest torch.amp API (removes deprecation warnings)
    - cosine LR scheduler + warmup
    - gradient clipping
    - flush leftover grad_accum batches (avoid losing the last step)
    - stratified train/val split → val contains every emotion
    - per-axis (P/A/D) MAE metrics + within-0.2 accuracy
    - early stopping
    - save best/last checkpoints + training history (JSON)
"""

import os
import sys
import json
import math
import argparse
import yaml
import torch
from collections import defaultdict
from torch.utils.data import DataLoader, Subset
from transformers import AutoTokenizer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from model import build_model                                   # noqa: E402
from dataset import PADDataset                                  # noqa: E402
from utils import (seed_everything, device_report, count_params,  # noqa: E402
                   pad_metrics, EarlyStopper, auto_tune)


def load_config(path):
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def stratified_split(dataset, val_ratio, seed):
    """Build val by taking val_ratio from each emotion label (every emotion appears in val)."""
    by_emotion = defaultdict(list)
    for i, s in enumerate(dataset.samples):
        by_emotion[s.get("emotion", "?")].append(i)

    g = torch.Generator().manual_seed(seed)
    train_idx, val_idx = [], []
    for _, idxs in by_emotion.items():
        idxs = [idxs[k] for k in torch.randperm(len(idxs), generator=g).tolist()]
        n_val = max(1, int(len(idxs) * val_ratio))
        val_idx += idxs[:n_val]
        train_idx += idxs[n_val:]
    return Subset(dataset, train_idx), Subset(dataset, val_idx)


def cosine_warmup(step, total_steps, warmup_steps):
    """LR multiplier that warms up then cosine-decays (0~1)."""
    if step < warmup_steps:
        return step / max(1, warmup_steps)
    progress = (step - warmup_steps) / max(1, total_steps - warmup_steps)
    return 0.5 * (1.0 + math.cos(math.pi * min(1.0, progress)))


@torch.no_grad()
def evaluate(model, loader, criterion, device, use_amp):
    model.eval()
    losses, all_pred, all_tgt = [], [], []
    for batch in loader:
        ids = batch["input_ids"].to(device)
        attn = batch["attention_mask"].to(device)
        tgt = batch["pad"].to(device)
        with torch.amp.autocast("cuda", enabled=use_amp):
            pred = model(ids, attn)
            loss = criterion(pred, tgt)
        losses.append(loss.item())
        all_pred.append(pred.float().cpu())
        all_tgt.append(tgt.float().cpu())
    preds = torch.cat(all_pred)
    tgts = torch.cat(all_tgt)
    metrics = pad_metrics(preds, tgts)
    metrics["mse"] = sum(losses) / max(1, len(losses))
    return metrics


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/auto.yaml")
    parser.add_argument("--resume", default=None, help="checkpoint to resume from")
    args = parser.parse_args()

    cfg = load_config(args.config)
    tcfg, dcfg, mcfg = cfg.get("train", {}), cfg.get("data", {}), cfg.get("model", {})

    seed = tcfg.get("seed", 42)
    seed_everything(seed)
    device, vram_gib = device_report()

    # GPU-agnostic auto-tuning: fill in batch_size / max_length / grad_accum /
    # grad_checkpoint from the detected VRAM unless the config sets them explicitly.
    # Enabled by default; set train.auto_tune: false in the config to opt out.
    if tcfg.get("auto_tune", True):
        tuned = auto_tune(vram_gib, cfg)
        tcfg["batch_size"] = tuned["batch_size"]
        tcfg["grad_accum"] = tuned["grad_accum"]
        tcfg["grad_checkpoint"] = tuned["grad_checkpoint"]
        dcfg["max_length"] = tuned["max_length"]

    # 1) tokenizer & model
    base_name = mcfg.get("base_model_name",
                         "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
    tokenizer = AutoTokenizer.from_pretrained(base_name)
    model = build_model(cfg).to(device)

    # gradient checkpointing (optional) — extra memory savings, slightly slower
    if tcfg.get("grad_checkpoint", False):
        try:
            base = getattr(model.encoder, "base_model", model.encoder)
            base.gradient_checkpointing_enable()
            print("[train] gradient checkpointing enabled")
        except Exception as e:
            print(f"[train] gradient checkpointing skipped: {e}")

    trainable, total = count_params(model)
    print(f"[train] trainable params: {trainable:,} / total: {total:,} "
          f"({100 * trainable / total:.2f}%)")

    # 2) dataset (stratified emotion split)
    full = PADDataset(dcfg.get("path", "data/seed_emotions.jsonl"),
                      tokenizer, max_length=dcfg.get("max_length", 64))
    train_ds, val_ds = stratified_split(full, tcfg.get("val_ratio", 0.15), seed)
    print(f"[train] train={len(train_ds)}  val={len(val_ds)}")

    bs = tcfg.get("batch_size", 8)
    train_loader = DataLoader(train_ds, batch_size=bs, shuffle=True, drop_last=False)
    val_loader = DataLoader(val_ds, batch_size=bs)

    # 3) optimizer / loss / AMP / scheduler
    lr = float(tcfg.get("lr", 2e-4))
    wd = float(tcfg.get("weight_decay", 0.01))
    optimizer = torch.optim.AdamW(
        [p for p in model.parameters() if p.requires_grad], lr=lr, weight_decay=wd)
    criterion = torch.nn.SmoothL1Loss(beta=0.1)  # Huber: more robust to label noise than MSE
    use_amp = device == "cuda" and tcfg.get("amp", True)
    scaler = torch.amp.GradScaler("cuda", enabled=use_amp)

    epochs = tcfg.get("epochs", 30)
    accum = max(1, tcfg.get("grad_accum", 2))
    clip = float(tcfg.get("grad_clip", 1.0))
    steps_per_epoch = math.ceil(len(train_loader) / accum)
    total_steps = steps_per_epoch * epochs
    warmup_steps = int(total_steps * tcfg.get("warmup_ratio", 0.1))
    global_step = 0

    stopper = EarlyStopper(patience=tcfg.get("early_stop_patience", 8))
    ckpt_dir = tcfg.get("checkpoint_dir", "checkpoints")
    os.makedirs(ckpt_dir, exist_ok=True)
    best_val = float("inf")
    history = []
    start_epoch = 1

    # 3b) resume
    if args.resume and os.path.exists(args.resume):
        ck = torch.load(args.resume, map_location=device)
        model.load_state_dict(ck["model_state"])
        if "optimizer_state" in ck:
            optimizer.load_state_dict(ck["optimizer_state"])
        start_epoch = ck.get("epoch", 0) + 1
        best_val = ck.get("val_mse", float("inf"))
        print(f"[train] resume: from epoch {start_epoch}, best_val={best_val:.4f}")

    # 4) training loop
    for epoch in range(start_epoch, epochs + 1):
        model.train()
        running = 0.0
        n_batches = len(train_loader)
        optimizer.zero_grad()

        for step, batch in enumerate(train_loader):
            ids = batch["input_ids"].to(device)
            attn = batch["attention_mask"].to(device)
            tgt = batch["pad"].to(device)

            with torch.amp.autocast("cuda", enabled=use_amp):
                pred = model(ids, attn)
                loss = criterion(pred, tgt) / accum
            scaler.scale(loss).backward()
            running += loss.item() * accum

            is_accum_step = (step + 1) % accum == 0
            is_last_batch = (step + 1) == n_batches
            if is_accum_step or is_last_batch:   # ← always flush the last leftover batch too
                # apply LR schedule
                mult = cosine_warmup(global_step, total_steps, warmup_steps)
                for pg in optimizer.param_groups:
                    pg["lr"] = lr * mult
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(
                    [p for p in model.parameters() if p.requires_grad], clip)
                scaler.step(optimizer)
                scaler.update()
                optimizer.zero_grad()
                global_step += 1

        avg_train = running / max(1, n_batches)
        val = evaluate(model, val_loader, criterion, device, use_amp)
        cur_lr = optimizer.param_groups[0]["lr"]

        print(f"[epoch {epoch:3d}/{epochs}] "
              f"train={avg_train:.4f}  val_mse={val['mse']:.4f}  "
              f"MAE={val['mae']:.3f} (P{val['mae_p']:.2f}/A{val['mae_a']:.2f}/D{val['mae_d']:.2f})  "
              f"acc<0.2={val['within_0.2']*100:.0f}%  lr={cur_lr:.2e}")

        history.append({"epoch": epoch, "train_loss": avg_train, **val, "lr": cur_lr})

        # save last (for resume)
        payload = {"model_state": model.state_dict(),
                   "optimizer_state": optimizer.state_dict(),
                   "config": cfg, "epoch": epoch, "val_mse": val["mse"]}
        torch.save(payload, os.path.join(ckpt_dir, "pad_encoder_last.pt"))

        # save best
        if val["mse"] < best_val:
            best_val = val["mse"]
            torch.save({"model_state": model.state_dict(), "config": cfg,
                        "epoch": epoch, "val_mse": val["mse"], "metrics": val},
                       os.path.join(ckpt_dir, "pad_encoder_best.pt"))
            print(f"           ✅ new best → pad_encoder_best.pt (val_mse={best_val:.4f})")

        if stopper.step(val["mse"]):
            print(f"[train] early stopping (no val improvement for {stopper.patience} epochs)")
            break

    # save training history
    with open(os.path.join(ckpt_dir, "history.json"), "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)
    print(f"\n[train] done! best val_mse = {best_val:.4f}")
    print(f"[train] checkpoint: {ckpt_dir}/pad_encoder_best.pt")
    print(f"[train] history: {ckpt_dir}/history.json")


if __name__ == "__main__":
    main()
