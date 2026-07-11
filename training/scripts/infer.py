# SPDX-License-Identifier: AGPL-3.0-or-later
# CogMesh — © 2026 심태양 (Shim Taeyang).
# Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
# (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
# herein are original works of the author (see the CogMesh Technical Whitepaper).
# This program is free software: redistribute/modify under the AGPL; it comes with
# NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
# offer its complete source to users.

"""
Infer PAD coordinates from text using the trained PAD Encoder.

Usage:
    python scripts/infer.py --text "드디어 해냈어!"
    python scripts/infer.py --text "너무 무서워" --checkpoint checkpoints/pad_encoder_best.pt
    python scripts/infer.py            # no args → interactive mode
"""

import os
import sys
import argparse
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from utils import (load_encoder_from_checkpoint, nearest_emotion,  # noqa: E402
                   EMERGENCE_THRESHOLD)


def encode(model, tokenizer, text, device, max_length=64):
    enc = tokenizer(text, truncation=True, max_length=max_length,
                    padding="max_length", return_tensors="pt").to(device)
    with torch.no_grad():
        pad = model(enc["input_ids"], enc["attention_mask"])[0].cpu().tolist()
    return pad


def show(text, pad):
    p, a, d = pad
    (ko, eid), dist = nearest_emotion(p, a, d)
    print(f'\ninput: "{text}"')
    print(f"PAD coord: P={p:+.2f}, A={a:+.2f}, D={d:+.2f}")
    print(f"nearest emotion: {ko} ({eid}), distance={dist:.2f}")
    if dist > EMERGENCE_THRESHOLD:
        print("→ 🌟 far from any core emotion: may be an emergent state!")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--text", default=None)
    parser.add_argument("--checkpoint", default="checkpoints/pad_encoder_best.pt")
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model, tokenizer, cfg = load_encoder_from_checkpoint(args.checkpoint, device)
    max_len = cfg.get("data", {}).get("max_length", 64)

    if args.text:
        show(args.text, encode(model, tokenizer, args.text, device, max_len))
    else:
        print("interactive mode (empty line to exit)")
        while True:
            try:
                t = input("\ntext> ").strip()
            except (EOFError, KeyboardInterrupt):
                break
            if not t:
                break
            show(t, encode(model, tokenizer, t, device, max_len))


if __name__ == "__main__":
    main()
