# SPDX-License-Identifier: AGPL-3.0-or-later
# CogMesh — © 2026 심태양 (Shim Taeyang).
# Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
# (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
# herein are original works of the author (see the CogMesh Technical Whitepaper).
# This program is free software: redistribute/modify under the AGPL; it comes with
# NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
# offer its complete source to users.

"""
wm_verify.py — point this at a suspect image (a screenshot someone reused, a figure
lifted into another document, etc.) and it reports whether CogMesh provenance
markers are present.

Usage:
    python tools/watermark/wm_verify.py suspect.png
    python tools/watermark/wm_verify.py suspect.png --canary 24B31BCA
    CogMesh_WM_KEY="your-private-key" python tools/watermark/wm_verify.py suspect.png

Exit code 0 if any marker is detected, 1 otherwise.
"""
import argparse
import os
import sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import stego  # noqa: E402

AUTHOR = "Copyright 심태양 (Shim Taeyang) — CogMesh v3.2 §S0"
DEFAULT_KEY = os.environ.get("CogMesh_WM_KEY", "CogMesh::" + AUTHOR)


def main():
    ap = argparse.ArgumentParser(description="Verify CogMesh provenance markers.")
    ap.add_argument("image", help="path to the suspect image")
    ap.add_argument("--key", default=DEFAULT_KEY, help="watermark key (default: env/derived)")
    ap.add_argument("--canary", default=None, help="expected canary code to match")
    args = ap.parse_args()

    rgb = np.asarray(Image.open(args.image).convert("RGB"))
    v = stego.verify_all(rgb, key=args.key, expected_canary=args.canary)

    print(f"\n  CogMesh provenance report — {args.image}")
    print("  " + "-" * 52)
    print(f"  Layer A · LSB signature : {v['lsb_signature'] or '(none / capture was lossy)'}")
    print(f"  Layer B · DCT watermark : correlation {v['dct_correlation']:+.4f} "
          f"-> {'PRESENT' if v['dct_present'] else 'not detected'}")
    print(f"  Layer C · canary code   : {v['canary_decoded']}"
          + (f"  (expected {args.canary}: {'MATCH' if v['canary_match'] else 'no match'})"
             if args.canary else ""))
    print("  " + "-" * 52)

    hit = bool(v["lsb_signature"]) or v["dct_present"] or v["canary_match"]
    if hit:
        print("  VERDICT: CogMesh provenance markers DETECTED. "
              "This material traces to 심태양 (Shim Taeyang), License v3.2 §S0.\n")
        sys.exit(0)
    print("  VERDICT: no CogMesh markers detected "
          "(image may be heavily re-processed, cropped, or unrelated).\n")
    sys.exit(1)


if __name__ == "__main__":
    main()
