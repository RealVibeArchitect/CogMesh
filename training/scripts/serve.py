# SPDX-License-Identifier: AGPL-3.0-or-later
# CogMesh — © 2026 심태양 (Shim Taeyang).
# Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
# (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
# herein are original works of the author (see the CogMesh Technical Whitepaper).
# This program is free software: redistribute/modify under the AGPL; it comes with
# NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
# offer its complete source to users.

"""
Serve the trained PAD Encoder as a local HTTP server.
→ lets the web app (causal_chat_v4) call it via fetch to use "real trained cognition."

Usage:
    python scripts/serve.py --checkpoint checkpoints/pad_encoder_best.pt --port 8848

Web-app integration (example):
    // src/core/pad/learnedPad.js
    const res = await fetch('http://localhost:8848/encode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: userMessage })
    });
    const { p, a, d } = await res.json();
    // feed this coordinate into PADState.update() → trained cognition, not rule-based!
"""

import os
import sys
import argparse
import json
from http.server import HTTPServer, BaseHTTPRequestHandler

import torch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from utils import load_encoder_from_checkpoint, nearest_emotion  # noqa: E402


class Handler(BaseHTTPRequestHandler):
    tokenizer = None
    model = None
    device = "cpu"
    max_length = 64

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path != "/encode":
            self.send_response(404)
            self._cors()
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or "{}")
        text = body.get("text", "")

        enc = self.tokenizer(text, truncation=True, max_length=self.max_length,
                             padding="max_length", return_tensors="pt").to(self.device)
        with torch.no_grad():
            pad = self.model(enc["input_ids"], enc["attention_mask"])[0].cpu().tolist()

        (ko, eid), dist = nearest_emotion(*pad)
        resp = json.dumps({"p": pad[0], "a": pad[1], "d": pad[2],
                           "nearest": eid, "nearest_ko": ko,
                           "distance": round(dist, 3)}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.end_headers()
        self.wfile.write(resp)

    def log_message(self, *args):
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", default="checkpoints/pad_encoder_best.pt")
    parser.add_argument("--port", type=int, default=8848)
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model, tokenizer, cfg = load_encoder_from_checkpoint(args.checkpoint, device)
    Handler.tokenizer = tokenizer
    Handler.model = model
    Handler.device = device
    Handler.max_length = cfg.get("data", {}).get("max_length", 64)

    server = HTTPServer(("localhost", args.port), Handler)
    print(f"[serve] PAD Encoder server started: http://localhost:{args.port}/encode (device={device})")
    print("[serve] POST {text} → {p, a, d, nearest, distance}")
    server.serve_forever()


if __name__ == "__main__":
    main()
