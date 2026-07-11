# SPDX-License-Identifier: AGPL-3.0-or-later
# CogMesh — © 2026 심태양 (Shim Taeyang).
# Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
# (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
# herein are original works of the author (see the CogMesh Technical Whitepaper).
# This program is free software: redistribute/modify under the AGPL; it comes with
# NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
# offer its complete source to users.

"""
PAD training dataset.

JSONL format (one line = one sample):
    {"text": "...", "p": 0.9, "a": 0.7, "d": 0.8, "emotion": "elated"}

Tokenize each sample and convert to a (P, A, D) label tensor.
On load, validate required fields and clamp PAD values to [-1,1].
"""

import json
import torch
from torch.utils.data import Dataset


class PADDataset(Dataset):
    def __init__(self, jsonl_path: str, tokenizer, max_length: int = 64):
        self.samples = []
        skipped = 0
        with open(jsonl_path, "r", encoding="utf-8") as f:
            for lineno, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    print(f"[PADDataset] ⚠️ line {lineno} JSON parse failed — skipping")
                    skipped += 1
                    continue
                # validate required fields
                if not obj.get("text") or any(k not in obj for k in ("p", "a", "d")):
                    print(f"[PADDataset] ⚠️ line {lineno} missing field (text/p/a/d) — skipping")
                    skipped += 1
                    continue
                # clamp PAD values to [-1, 1] (guard against label errors)
                for k in ("p", "a", "d"):
                    obj[k] = max(-1.0, min(1.0, float(obj[k])))
                self.samples.append(obj)

        if not self.samples:
            raise ValueError(f"[PADDataset] zero valid samples: {jsonl_path}")
        msg = f"[PADDataset] loaded {len(self.samples)} samples: {jsonl_path}"
        if skipped:
            msg += f" ({skipped} skipped)"
        print(msg)

        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        s = self.samples[idx]
        enc = self.tokenizer(
            s["text"],
            truncation=True,
            max_length=self.max_length,
            padding="max_length",
            return_tensors="pt",
        )
        pad = torch.tensor([s["p"], s["a"], s["d"]], dtype=torch.float32)
        return {
            "input_ids": enc["input_ids"].squeeze(0),
            "attention_mask": enc["attention_mask"].squeeze(0),
            "pad": pad,
        }
