# CogMesh Provenance Marking Toolkit 🛡️

Provenance marking for the CogMesh
whitepaper figures. It stamps the PAD coordinate table and formula images with
three independent, layered watermarks so that any capture — screenshot, screen
recording frame, or figure lifted into someone else's document — can be traced
back to 심태양 (Shim Taeyang).

## The three layers

| Layer | Mechanism | Encodes | Survives | Purpose |
|------|-----------|---------|----------|---------|
| **A · LSB signature** | least-significant bits of pixels | full text `Copyright 심태양 …` | lossless PNG capture; **not** JPEG/resize | exact, human-readable proof from the file source |
| **B · DCT spread-spectrum** | key-seeded PN sequence in a mid-frequency DCT band | a hidden "this is mine" signal | mild JPEG (≥ q60), rescaling | robust presence proof by correlation |
| **C · canary code** | redundant sign-bits across image blocks | initials + date fingerprint (e.g. `24B31BCA`) | mild JPEG, rescaling | defeats "we typed it ourselves" claims |

> Verified robustness (self-test in `build_assets.py`): through a JPEG **q60**
> re-compression, Layer A is lost but **B and C still detect and the canary still
> matches** — enough to prove origin from a screenshot someone re-saved.

## Quick start

```bash
pip install -r tools/watermark/requirements.txt

# (recommended) set a PRIVATE key so nobody can forge or strip markers knowingly
export CogMesh_WM_KEY="pick-a-long-secret-only-you-know"

# render + watermark the figures into docs/assets/  (also runs a self-test)
python tools/watermark/build_assets.py

# later — someone reused your figure? point the verifier at their image:
python tools/watermark/wm_verify.py suspect.png --canary 24B31BCA
```

## Files

- `stego.py` — core library (embed/extract for all three layers)
- `build_assets.py` — renders `pad_table` + `pad_formulas`, watermarks them, self-tests
- `wm_verify.py` — CLI that judges a suspect image and prints a verdict
- `CANARY_RECORD.private.txt` — generated record of your canary codes. **Keep private.**

## Important notes (read me)

- **Set your own `CogMesh_WM_KEY`.** The default key is derived from the public
  author string and is only for demonstration. A private key is what makes Layer B/C
  unforgeable by others.
- **Keep `CANARY_RECORD.private.txt` out of the public repo** (it is git-ignored).
  It is your side of the evidence.
- LSB (Layer A) is intentionally fragile — it is your *bonus* exact-text proof for
  clean captures. Layers B and C are the robust ones.
- No watermark is unbeatable. A determined adversary who heavily crops, rotates,
  re-types, and re-renders can degrade markers. This toolkit raises the cost and
  gives you strong, court-useful evidence in the common cases; it is **not** a
  substitute for copyright registration or legal counsel.
