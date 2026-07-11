# SPDX-License-Identifier: AGPL-3.0-or-later
# CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
#
# training/scripts/export_embedder.py — export the MiniLM sentence-embedding encoder to ONNX.
#
# CogMesh's semantic retrieval runs LOCALLY (no embedding API): the same multilingual MiniLM
# that backs the PAD encoder produces sentence embeddings for memory search. This script
# exports JUST the encoder + mean-pooling (no PAD head) as a portable ONNX model, so the JS
# side can embed text and do cosine-similarity retrieval fully offline.
#
#   text → [MiniLM encoder] → [mean-pool over tokens] → 384-d sentence embedding
#
# Usage:
#   python training/scripts/export_embedder.py \
#       --out training/checkpoints/embedder.onnx
#   # (uses the base multilingual MiniLM by default; pass --checkpoint to use a fine-tuned one)
#
# Output: embedder.onnx + a sibling tokenizer/ dir (JS needs both to turn text → ids → vec).

import argparse
import os

import torch
import torch.nn as nn
from transformers import AutoModel, AutoTokenizer

DEFAULT_BASE = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"


class SentenceEmbedder(nn.Module):
    """MiniLM encoder + mask-aware mean pooling → normalized sentence embedding."""

    def __init__(self, base_model_name: str):
        super().__init__()
        self.encoder = AutoModel.from_pretrained(base_model_name)

    def forward(self, input_ids, attention_mask):
        out = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        mask = attention_mask.unsqueeze(-1).float()
        summed = (out.last_hidden_state * mask).sum(dim=1)
        counts = mask.sum(dim=1).clamp(min=1e-9)
        pooled = summed / counts
        # L2-normalize so cosine similarity == dot product on the JS side
        return torch.nn.functional.normalize(pooled, p=2, dim=1)


def main():
    parser = argparse.ArgumentParser(description="Export MiniLM sentence embedder to ONNX")
    parser.add_argument("--base", default=DEFAULT_BASE,
                        help="base HF model (multilingual MiniLM by default)")
    parser.add_argument("--checkpoint", default=None,
                        help="optional fine-tuned encoder dir to load instead of the base")
    parser.add_argument("--out", default="training/checkpoints/embedder.onnx")
    parser.add_argument("--max-length", type=int, default=128)
    args = parser.parse_args()

    base = args.checkpoint or args.base
    print(f"[embedder] loading encoder: {base}")
    model = SentenceEmbedder(base).eval()
    tokenizer = AutoTokenizer.from_pretrained(base)

    enc = tokenizer("export probe sentence", truncation=True,
                    max_length=args.max_length, padding="max_length", return_tensors="pt")
    dummy = (enc["input_ids"], enc["attention_mask"])

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    torch.onnx.export(
        model, dummy, args.out,
        input_names=["input_ids", "attention_mask"],
        output_names=["embedding"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "attention_mask": {0: "batch", 1: "seq"},
            "embedding": {0: "batch"},
        },
        opset_version=14,
    )
    print(f"[embedder] ONNX saved: {args.out}")

    # embedding dim (for the JS side to know the vector length)
    with torch.no_grad():
        dim = model(*dummy).shape[1]
    print(f"[embedder] embedding dim: {dim}")

    tok_dir = os.path.join(os.path.dirname(args.out) or ".", "tokenizer")
    os.makedirs(tok_dir, exist_ok=True)
    tokenizer.save_pretrained(tok_dir)
    print(f"[embedder] tokenizer saved: {tok_dir}")

    # optional: validate with onnxruntime if available
    try:
        import onnxruntime as ort  # noqa: F401
        import numpy as np
        sess = ort.InferenceSession(args.out, providers=["CPUExecutionProvider"])
        outs = sess.run(None, {
            "input_ids": enc["input_ids"].numpy(),
            "attention_mask": enc["attention_mask"].numpy(),
        })
        norm = float(np.linalg.norm(outs[0][0]))
        print(f"[embedder] onnxruntime OK — output norm ≈ {norm:.3f} (should be ~1.0)")
    except ImportError:
        print("[embedder] onnxruntime not installed — skipping validation")


if __name__ == "__main__":
    main()
