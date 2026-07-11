# SPDX-License-Identifier: AGPL-3.0-or-later
# CogMesh — © 2026 심태양 (Shim Taeyang).
# Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
# (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
# herein are original works of the author (see the CogMesh Technical Whitepaper).
# This program is free software: redistribute/modify under the AGPL; it comes with
# NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
# offer its complete source to users.

"""
Export the trained PAD Encoder to ONNX → direct inference in a web app / onnxruntime.

Usage:
    python scripts/export_onnx.py --checkpoint checkpoints/pad_encoder_best.pt \
                                  --out checkpoints/pad_encoder.onnx

Key points:
    - merge LoRA adapters into the base (merge_and_unload) before export → a pure forward graph.
    - declare dynamic axes (batch, seq_len) to support varied input lengths.
    - after export, validate with onnxruntime (check numeric error).
"""

import os
import sys
import argparse
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from utils import load_encoder_from_checkpoint  # noqa: E402


def merge_lora(model):
    """If possible, merge LoRA adapters into the base weights to make a pure module."""
    enc = model.encoder
    if hasattr(enc, "merge_and_unload"):
        try:
            model.encoder = enc.merge_and_unload()
            print("[export] LoRA merge complete (merge_and_unload)")
        except Exception as e:
            print(f"[export] LoRA merge skipped: {e}")
    return model


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", default="checkpoints/pad_encoder_best.pt")
    parser.add_argument("--out", default="checkpoints/pad_encoder.onnx")
    parser.add_argument("--max_length", type=int, default=64)
    args = parser.parse_args()

    device = "cpu"  # export is stable on CPU
    model, tokenizer, cfg = load_encoder_from_checkpoint(args.checkpoint, device)
    model = merge_lora(model).eval()

    # dummy input
    enc = tokenizer("export test sentence", truncation=True,
                    max_length=args.max_length, padding="max_length",
                    return_tensors="pt")
    dummy = (enc["input_ids"], enc["attention_mask"])

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    torch.onnx.export(
        model, dummy, args.out,
        input_names=["input_ids", "attention_mask"],
        output_names=["pad"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "attention_mask": {0: "batch", 1: "seq"},
            "pad": {0: "batch"},
        },
        opset_version=14,
    )
    print(f"[export] ONNX saved: {args.out}")

    # also save the tokenizer next to the .onnx — web/JS inference needs it to turn text
    # into input_ids/attention_mask. Without this, the .onnx model is unusable at runtime.
    tok_dir = os.path.join(os.path.dirname(args.out) or ".", "tokenizer")
    os.makedirs(tok_dir, exist_ok=True)
    tokenizer.save_pretrained(tok_dir)
    print(f"[export] tokenizer saved: {tok_dir}  (load it in JS to encode text → ids)")

    # validation (if onnxruntime is available)
    try:
        import onnxruntime as ort
        import numpy as np
        with torch.no_grad():
            torch_out = model(*dummy).numpy()
        sess = ort.InferenceSession(args.out, providers=["CPUExecutionProvider"])
        ort_out = sess.run(None, {
            "input_ids": dummy[0].numpy(),
            "attention_mask": dummy[1].numpy(),
        })[0]
        diff = float(np.abs(torch_out - ort_out).max())
        print(f"[export] onnxruntime check: max error {diff:.2e} "
              f"({'✅ OK' if diff < 1e-3 else '⚠️ large error'})")
    except ImportError:
        print("[export] onnxruntime not installed — skipping validation "
              "(install with: pip install onnxruntime)")


if __name__ == "__main__":
    main()
