# CogMesh Seed Emotion Dataset 🎭

`seed_emotions.jsonl` — the seed training data that teaches the PAD encoder to map
**Korean text → PAD coordinates**. Released openly under the project's license
(AGPL-3.0-or-later), so anyone can study, reproduce, and extend it.

## Format

One JSON object per line:

```json
{"text": "드디어 목표를 달성했어! 정말 최고의 순간이야", "p": 1.0, "a": 0.7, "d": 0.8, "emotion": "elated"}
```

| Field | Type | Meaning |
|-------|------|---------|
| `text` | string | a natural-language sentence (currently Korean) |
| `p` | float ∈ [-1, 1] | **Pleasure** (valence) |
| `a` | float ∈ [-1, 1] | **Arousal** (activation) |
| `d` | float ∈ [-1, 1] | **Dominance** (control) |
| `emotion` | string | the nearest of the 20 core emotions (label) |

The 20 core emotions and their canonical (P, A, D) anchor values are defined in
`core/pad/emotionMap.js` and Appendix B of the whitepaper — those coordinate values
are the original work of 심태양 (Shim Taeyang).

## Stats

- ~330 seed samples across the 20 core emotions
- Each sample's (p, a, d) is anchored to its emotion's canonical coordinate
- Language: Korean (the base encoder is multilingual MiniLM, so the pipeline extends
  to other languages — contributions of multilingual samples are welcome!)

## How it's used

```bash
python training/scripts/train.py --config training/configs/auto.yaml
```

The trainer does a **stratified** train/val split (every emotion appears in val) and
learns a regression head that outputs (p, a, d) ∈ [-1, 1]³. See `training/README.md`.

## Contributing samples

More data = a better encoder! To add samples:

1. Append lines to `seed_emotions.jsonl` in the exact format above.
2. Keep `p/a/d` within [-1, 1]; set `emotion` to the closest core emotion id.
3. Aim for natural, varied phrasing (not just paraphrases of existing lines).
4. Open a PR — contributions are covered by the [CLA](../../CLA.md).

> Note: what is **not** published here is the *trained model weights*
> (`checkpoints/*.pt`) — those stay out of the repo. The data and training code are
> open so you can reproduce (or improve on) the encoder yourself.
