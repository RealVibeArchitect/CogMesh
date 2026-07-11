# SPDX-License-Identifier: AGPL-3.0-or-later
# CogMesh — © 2026 심태양 (Shim Taeyang).
# Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
# (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
# herein are original works of the author (see the CogMesh Technical Whitepaper).
# This program is free software: redistribute/modify under the AGPL; it comes with
# NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
# offer its complete source to users.

"""
PAD Encoder model definition.

Puts a PAD 3-coordinate (P, A, D) regression head on top of a small pretrained transformer encoder.
Supports LoRA adapters so the encoder trains on modest CUDA GPUs (from ~6GB laptop cards up)
without full fine-tuning; a base-freeze option trades a little accuracy for even less memory.

Key idea:
    text → [transformer encoder] → [pooling] → [regression head] → (p, a, d) ∈ [-1,1]³
    a tanh on the output always guarantees the [-1, 1] range (same as the web-app PAD coordinate system).
"""

import torch
import torch.nn as nn
from transformers import AutoModel, AutoConfig


class PADEncoder(nn.Module):
    def __init__(
        self,
        base_model_name: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        use_lora: bool = True,
        lora_r: int = 8,
        lora_alpha: int = 16,
        lora_dropout: float = 0.05,
        dropout: float = 0.1,
        freeze_base: bool = False,
    ):
        super().__init__()

        # 1) load base encoder (multilingual MiniLM = small, supports Korean, fits low-VRAM GPUs)
        self.config = AutoConfig.from_pretrained(base_model_name)
        self.encoder = AutoModel.from_pretrained(base_model_name)
        hidden = self.config.hidden_size

        # 2) apply LoRA (optional) — train adapters instead of full fine-tuning to save memory
        if use_lora:
            try:
                from peft import LoraConfig, get_peft_model, TaskType
                lora_cfg = LoraConfig(
                    task_type=TaskType.FEATURE_EXTRACTION,
                    r=lora_r,
                    lora_alpha=lora_alpha,
                    lora_dropout=lora_dropout,
                    target_modules=["query", "key", "value", "dense"],
                    bias="none",
                )
                self.encoder = get_peft_model(self.encoder, lora_cfg)
                print("[PADEncoder] LoRA applied (trainable params greatly reduced)")
            except ImportError:
                print("[PADEncoder] ⚠️ peft not installed — proceeding without LoRA. `pip install peft`")

        # 3) base-freeze option (train only the head for extreme memory savings)
        if freeze_base and not use_lora:
            for p in self.encoder.parameters():
                p.requires_grad = False
            print("[PADEncoder] base encoder frozen — training the regression head only")

        # 4) PAD regression head: hidden → 3 (P, A, D)
        self.head = nn.Sequential(
            nn.Linear(hidden, hidden // 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(hidden // 2, 3),
        )

    def mean_pool(self, last_hidden_state, attention_mask):
        """Mean pooling that respects the attention mask (sentence embedding)."""
        mask = attention_mask.unsqueeze(-1).float()
        summed = (last_hidden_state * mask).sum(dim=1)
        counts = mask.sum(dim=1).clamp(min=1e-9)
        return summed / counts

    def forward(self, input_ids, attention_mask):
        out = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        pooled = self.mean_pool(out.last_hidden_state, attention_mask)
        raw = self.head(pooled)
        # tanh guarantees the [-1, 1] range → same as the web-app PAD coordinate system
        pad = torch.tanh(raw)
        return pad  # shape: (batch, 3) → [P, A, D]


def build_model(cfg: dict) -> PADEncoder:
    """Build the model from a config dict."""
    m = cfg.get("model", {})
    return PADEncoder(
        base_model_name=m.get("base_model_name",
                              "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"),
        use_lora=m.get("use_lora", True),
        lora_r=m.get("lora_r", 8),
        lora_alpha=m.get("lora_alpha", 16),
        lora_dropout=m.get("lora_dropout", 0.05),
        dropout=m.get("dropout", 0.1),
        freeze_base=m.get("freeze_base", False),
    )
