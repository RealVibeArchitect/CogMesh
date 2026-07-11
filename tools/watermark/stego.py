# SPDX-License-Identifier: AGPL-3.0-or-later
# CogMesh — © 2026 심태양 (Shim Taeyang).
# Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
# (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
# herein are original works of the author (see the CogMesh Technical Whitepaper).
# This program is free software: redistribute/modify under the AGPL; it comes with
# NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
# offer its complete source to users.

"""
stego.py — Three-layer provenance marking for CogMesh whitepaper figures.

Layer A — LSB signature      : exact UTF-8 payload in the pixel least-significant
                               bits. Survives lossless (PNG) screenshots; destroyed
                               by JPEG re-compression or resizing.
Layer B — DCT spread-spectrum: a key-seeded pseudo-random sequence added to a mid-
                               frequency band of the global 2-D DCT of luminance.
                               Detected by normalized correlation. Robust to mild
                               JPEG compression and rescaling — the "this is mine"
                               presence proof.
Layer C — Canary code        : a short code (author initials + date) embedded as
                               redundant sign-bits across image blocks, decoded by
                               majority vote. Proves a *specific* fingerprint so a
                               copier cannot claim independent authorship.

Author's note: set a PRIVATE key via CogMesh_WM_KEY env var for real deployments.
The default key is derived from the author string and is fine for demonstration.
"""

from __future__ import annotations
import hashlib
import os
import numpy as np
from PIL import Image
from scipy.fft import dctn, idctn

MAGIC = b"CMWM"  # CogMesh Water-Mark
DEFAULT_AUTHOR = "Copyright 심태양 (Shim Taeyang) — CogMesh v3.2 §S0"


# ----------------------------------------------------------------------------- keys
def _key_bytes(key: str) -> bytes:
    return hashlib.sha256(key.encode("utf-8")).digest()


def _rng(key: str, salt: str = "") -> np.random.Generator:
    seed = int.from_bytes(hashlib.sha256((key + "|" + salt).encode()).digest()[:8], "big")
    return np.random.default_rng(seed)


# ----------------------------------------------------------- Layer A: LSB signature
def embed_lsb(img: np.ndarray, payload: str) -> np.ndarray:
    """Embed MAGIC + uint32 length + payload (UTF-8), repeated to fill capacity."""
    flat = img.reshape(-1).copy()
    data = MAGIC + len(payload.encode()).to_bytes(4, "big") + payload.encode("utf-8")
    bits = np.unpackbits(np.frombuffer(data, dtype=np.uint8))
    if bits.size > flat.size:
        raise ValueError("payload too large for image")
    # write once, then repeat the payload across remaining capacity for redundancy
    reps = flat.size // bits.size
    tiled = np.tile(bits, reps)
    flat[: tiled.size] = (flat[: tiled.size] & 0xFE) | tiled
    return flat.reshape(img.shape)


def extract_lsb(img: np.ndarray) -> str | None:
    flat = img.reshape(-1)
    bits = (flat & 1).astype(np.uint8)
    header_bits = bits[: (len(MAGIC) + 4) * 8]
    header = np.packbits(header_bits).tobytes()
    if header[:4] != MAGIC:
        return None
    length = int.from_bytes(header[4:8], "big")
    total_bytes = len(MAGIC) + 4 + length
    payload_bits = bits[: total_bytes * 8]
    raw = np.packbits(payload_bits).tobytes()
    try:
        return raw[8 : 8 + length].decode("utf-8")
    except UnicodeDecodeError:
        return None


# --------------------------------------------------- Layer B: DCT spread-spectrum
def _midband_mask(shape, lo=0.15, hi=0.55) -> np.ndarray:
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w]
    r = np.sqrt((yy / h) ** 2 + (xx / w) ** 2)
    return (r >= lo) & (r <= hi)


def embed_dct(y: np.ndarray, key: str, alpha: float = 6.0) -> np.ndarray:
    C = dctn(y, norm="ortho")
    mask = _midband_mask(C.shape)
    idx = np.flatnonzero(mask.reshape(-1))
    pn = _rng(key, "dct").standard_normal(idx.size)
    flatC = C.reshape(-1)
    flatC[idx] += alpha * pn
    return idctn(flatC.reshape(C.shape), norm="ortho")


def detect_dct(y: np.ndarray, key: str) -> float:
    """Return normalized correlation in [-1, 1]; >~0.02 with our alpha means present."""
    C = dctn(y, norm="ortho")
    mask = _midband_mask(C.shape)
    idx = np.flatnonzero(mask.reshape(-1))
    pn = _rng(key, "dct").standard_normal(idx.size)
    coeffs = C.reshape(-1)[idx]
    coeffs = coeffs - coeffs.mean()
    denom = np.linalg.norm(coeffs) * np.linalg.norm(pn) + 1e-9
    return float(np.dot(coeffs, pn) / denom)


# ------------------------------------------------------------ Layer C: canary code
def canary_code(author_initials: str, date_iso: str, key: str) -> str:
    """A short, deterministic 8-hex canary derived from initials+date+key."""
    h = hashlib.sha256(f"{author_initials}|{date_iso}|{key}".encode()).hexdigest()
    return h[:8].upper()


def _code_bits(code_hex: str) -> np.ndarray:
    b = bytes.fromhex(code_hex)
    return np.unpackbits(np.frombuffer(b, dtype=np.uint8))


def embed_canary(y: np.ndarray, code_hex: str, key: str, strength: float = 2.5,
                 block: int = 16) -> np.ndarray:
    bits = _code_bits(code_hex)
    H, W = y.shape
    bh, bw = H // block, W // block
    rng = _rng(key, "canary")
    order = rng.permutation(bh * bw)
    out = y.copy()
    for n, bidx in enumerate(order):
        bit = int(bits[n % bits.size])
        by, bx = divmod(bidx, bw)
        sl = (slice(by * block, by * block + block), slice(bx * block, bx * block + block))
        blk = out[sl]
        Cb = dctn(blk, norm="ortho")
        # nudge a fixed mid coeff: sign encodes the bit
        sign = 1.0 if bit else -1.0
        Cb[3, 4] = sign * (abs(Cb[3, 4]) + strength)
        out[sl] = idctn(Cb, norm="ortho")
    return out


def decode_canary(y: np.ndarray, key: str, n_bits: int = 32, block: int = 16) -> str:
    H, W = y.shape
    bh, bw = H // block, W // block
    rng = _rng(key, "canary")
    order = rng.permutation(bh * bw)
    votes = np.zeros(n_bits)
    counts = np.zeros(n_bits)
    for n, bidx in enumerate(order):
        by, bx = divmod(bidx, bw)
        sl = (slice(by * block, by * block + block), slice(bx * block, bx * block + block))
        Cb = dctn(y[sl], norm="ortho")
        votes[n % n_bits] += 1.0 if Cb[3, 4] > 0 else -1.0
        counts[n % n_bits] += 1
    bits = (votes > 0).astype(np.uint8)
    return np.packbits(bits).tobytes().hex().upper()


# ------------------------------------------------------------------ orchestration
def to_luma(img: np.ndarray) -> tuple[np.ndarray, Image.Image]:
    pil = Image.fromarray(img).convert("YCbCr")
    ycc = np.asarray(pil).astype(np.float64)
    return ycc[..., 0], pil


def apply_all(rgb: np.ndarray, *, author=DEFAULT_AUTHOR, initials="STY",
              date_iso="2026-01-01", key: str | None = None) -> tuple[np.ndarray, dict]:
    key = key or os.environ.get("CogMesh_WM_KEY", "CogMesh::" + author)
    code = canary_code(initials, date_iso, key)

    # Work in YCbCr for B & C, then re-apply LSB (A) on the final RGB.
    pil = Image.fromarray(rgb).convert("YCbCr")
    ycc = np.asarray(pil).astype(np.float64)
    y = ycc[..., 0]
    y = embed_dct(y, key)
    y = embed_canary(y, code, key)
    ycc[..., 0] = np.clip(y, 0, 255)
    rgb_out = np.asarray(Image.fromarray(ycc.astype(np.uint8), "YCbCr").convert("RGB"))

    rgb_out = embed_lsb(rgb_out, author)  # Layer A last so PNG keeps exact bits
    meta = {"canary": code, "author": author, "initials": initials, "date": date_iso}
    return rgb_out, meta


def verify_all(rgb: np.ndarray, *, key: str, expected_canary: str | None = None) -> dict:
    lsb = extract_lsb(rgb)
    y = np.asarray(Image.fromarray(rgb).convert("YCbCr")).astype(np.float64)[..., 0]
    corr = detect_dct(y, key)
    canary = decode_canary(y, key)
    return {
        "lsb_signature": lsb,
        "dct_correlation": round(corr, 4),
        "dct_present": corr > 0.015,
        "canary_decoded": canary,
        "canary_match": (expected_canary is not None and canary == expected_canary),
    }
