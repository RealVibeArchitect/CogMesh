# SPDX-License-Identifier: AGPL-3.0-or-later
# CogMesh — © 2026 심태양 (Shim Taeyang).
# Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
# (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
# herein are original works of the author (see the CogMesh Technical Whitepaper).
# This program is free software: redistribute/modify under the AGPL; it comes with
# NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
# offer its complete source to users.

"""
build_assets.py — render the PAD coordinate table and core formulae as PNG figures,
embed three-layer provenance markers (LSB + DCT + canary), write them to
docs/assets/, and run a self-test that simulates screenshot / JPEG capture.

Run:  python tools/watermark/build_assets.py
"""
import io
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(__file__))
import stego  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ASSETS = os.path.join(ROOT, "docs", "assets")
os.makedirs(ASSETS, exist_ok=True)

AUTHOR = "Copyright 심태양 (Shim Taeyang) — CogMesh v3.2 §S0"
INITIALS = "STY"
DATE = "2026-01-01"
KEY = os.environ.get("CogMesh_WM_KEY", "CogMesh::" + AUTHOR)

EMOTIONS = [
    (1, "Elated 환희", 1.0, 0.7, 0.8), (2, "Serene 평온", 0.6, -0.6, 0.4),
    (3, "Proud 자신감", 0.7, 0.3, 1.0), (4, "Excited 흥분", 0.8, 0.1, 0.5),
    (5, "Relieved 안도", 0.5, -0.5, 0.3), (6, "Grateful 감사", 0.9, -0.2, 0.2),
    (7, "Optimistic 낙관", 0.7, 0.3, 0.6), (8, "Awe 경외", 0.8, 0.4, -0.2),
    (9, "Curious 호기심", 0.4, 0.6, 0.2), (10, "Angry 분노", -0.8, 0.9, 0.4),
    (11, "Lethargic 무기력", -0.6, -0.9, -0.8), (12, "Ashamed 수치심", -0.7, -0.2, -0.1),
    (13, "Sad 슬픔", -0.8, -0.4, -0.6), (14, "Disgust 혐오", -0.9, 0.2, 0.1),
    (15, "Tense 긴장", -0.2, 0.8, -0.3), (16, "Puzzled 당혹", -0.1, 0.5, -0.2),
    (17, "Bored 지루함", -0.3, -0.7, -0.2), (18, "Envy 질투", -0.6, 0.4, -0.5),
    (19, "Panic 공포", -0.9, 1.0, -0.7), (20, "Vigilant 경계", -0.2, 0.6, 0.3),
]


def _font(size, bold=False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf" % ("-Bold" if bold else ""),
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    ]
    for c in candidates:
        if os.path.exists(c):
            try:
                return ImageFont.truetype(c, size)
            except Exception:
                pass
    return ImageFont.load_default()


def render_table() -> Image.Image:
    W, rowh, top = 720, 30, 96
    H = top + rowh * (len(EMOTIONS) + 1) + 90
    img = Image.new("RGB", (W, H), (252, 252, 250))
    d = ImageDraw.Draw(img)
    title = _font(24, True); hdr = _font(16, True); cell = _font(15); small = _font(11)
    d.text((28, 26), "CogMesh — PAD Coordinate Table (20 Seed Emotions)", font=title, fill=(20, 20, 30))
    d.text((28, 62), "P, A, D \u2208 [-1, +1]   \u00b7   Original work of \uc2ec\ud0dc\uc591 (Shim Taeyang)", font=small, fill=(90, 90, 100))
    cols = [28, 70, 340, 470, 590, 700]
    headers = ["#", "Emotion (EN / KO)", "P", "A", "D"]
    y = top
    d.rectangle([20, y, W - 20, y + rowh], fill=(30, 34, 60))
    for i, htext in enumerate(headers):
        d.text((cols[i] + 6, y + 7), htext, font=hdr, fill=(240, 240, 250))
    y += rowh
    for r, (n, name, p, a, dd) in enumerate(EMOTIONS):
        bg = (243, 244, 248) if r % 2 == 0 else (252, 252, 250)
        d.rectangle([20, y, W - 20, y + rowh], fill=bg)
        vals = [str(n), name, f"{p:+.1f}", f"{a:+.1f}", f"{dd:+.1f}"]
        for i, v in enumerate(vals):
            d.text((cols[i] + 6, y + 6), v, font=cell, fill=(25, 25, 35))
        y += rowh
    d.text((28, y + 14),
           "\u00a9 2026 \uc2ec\ud0dc\uc591. Protected under CogMesh License v3.2 \u00a7S0. Unauthorized reproduction,",
           font=small, fill=(120, 60, 60))
    d.text((28, y + 30),
           "screenshots, screen recordings & digital captures for commercial use are prohibited.",
           font=small, fill=(120, 60, 60))
    d.text((28, y + 46),
           "\U0001f6e1\ufe0f  This image carries invisible provenance markers (License \u00a7S0.6).",
           font=small, fill=(60, 90, 120))
    return img


def render_formulas() -> Image.Image:
    W, H = 720, 340
    img = Image.new("RGB", (W, H), (252, 252, 250))
    d = ImageDraw.Draw(img)
    title = _font(22, True); mono = _font(17); small = _font(11)
    d.text((28, 24), "CogMesh — Core PAD Formulae", font=title, fill=(20, 20, 30))
    lines = [
        "PAD = (P, A, D),   P, A, D \u2208 [-1, +1]",
        "blended = ( \u03a3\u1d62 w\u1d62 \u00b7 coord\u1d62 ) / ( \u03a3\u1d62 w\u1d62 )",
        "Emotion = argmin\u1d62  \u2016 PAD \u2212 PAD\u1d62 \u2016\u2082",
        "emergent  \u21d0  blend-distance > 0.55",
        "PAD\u209c = \u03b1 \u00b7 PAD_target + (1 \u2212 \u03b1) \u00b7 PAD\u209c\u208b\u2081     (EMA)",
    ]
    y = 78
    for ln in lines:
        d.text((40, y), ln, font=mono, fill=(25, 25, 40)); y += 42
    d.text((28, y + 8),
           "\u00a9 2026 \uc2ec\ud0dc\uc591 \u2014 Original works. CogMesh License v3.2 \u00a7S0. \U0001f6e1\ufe0f provenance-marked.",
           font=small, fill=(120, 60, 60))
    return img


def _simulate_png_screenshot(rgb: np.ndarray) -> np.ndarray:
    buf = io.BytesIO(); Image.fromarray(rgb).save(buf, "PNG")
    buf.seek(0); return np.asarray(Image.open(buf).convert("RGB"))


def _simulate_jpeg_capture(rgb: np.ndarray, q=85) -> np.ndarray:
    buf = io.BytesIO(); Image.fromarray(rgb).save(buf, "JPEG", quality=q)
    buf.seek(0); return np.asarray(Image.open(buf).convert("RGB"))


def build_one(name: str, pil_img: Image.Image):
    rgb = np.asarray(pil_img.convert("RGB"))
    marked, meta = stego.apply_all(rgb, author=AUTHOR, initials=INITIALS, date_iso=DATE, key=KEY)
    out_png = os.path.join(ASSETS, name + "_watermarked.png")
    Image.fromarray(marked).save(out_png, "PNG")

    print(f"\n=== {name} ===")
    print(f"  saved: {os.path.relpath(out_png, ROOT)}   canary={meta['canary']}")

    # self-test: original, PNG screenshot, JPEG capture
    for label, cap in [("clean       ", marked),
                       ("png-capture ", _simulate_png_screenshot(marked)),
                       ("jpeg q85    ", _simulate_jpeg_capture(marked, 85)),
                       ("jpeg q60    ", _simulate_jpeg_capture(marked, 60))]:
        v = stego.verify_all(cap, key=KEY, expected_canary=meta["canary"])
        lsb_ok = "Y" if v["lsb_signature"] else "-"
        print(f"  [{label}] LSB:{lsb_ok}  DCT:{v['dct_correlation']:+.3f} "
              f"present={v['dct_present']}  canary={v['canary_decoded']} "
              f"match={v['canary_match']}")
    return out_png, meta


def main():
    print("Building watermarked assets under docs/assets/ ...")
    t, tmeta = build_one("pad_table", render_table())
    f, fmeta = build_one("pad_formulas", render_formulas())
    # write a private canary record for the author's records (NOT for distribution)
    rec = os.path.join(os.path.dirname(__file__), "CANARY_RECORD.private.txt")
    with open(rec, "w", encoding="utf-8") as fh:
        fh.write("CogMesh provenance canary record — KEEP PRIVATE\n")
        fh.write(f"author   : {AUTHOR}\ninitials : {INITIALS}\ndate     : {DATE}\n")
        fh.write(f"key-hint : env CogMesh_WM_KEY (default derived from author)\n")
        fh.write(f"pad_table    canary = {tmeta['canary']}\n")
        fh.write(f"pad_formulas canary = {fmeta['canary']}\n")
    print(f"\nPrivate canary record written: {os.path.relpath(rec, ROOT)}")
    print("Done.")


if __name__ == "__main__":
    main()
