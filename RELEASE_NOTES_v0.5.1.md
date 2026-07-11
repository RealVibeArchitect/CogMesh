# CogMesh v0.5.1

An open, dependency-free cognitive architecture for AI — with a **runnable constitutional
governance core** for the hard problem a self-improving system poses: how do you let a system act,
learn, and even modify itself without letting it act unsafely or edit away its own oversight?

This is the first public release.

---

## What makes this different

Most work on AI safety *asserts* that a system is safe. CogMesh's governance core is built the other
way around: **it tries to break itself, and shows you the results.**

- An adversarial red-team harness (`npm run redteam`) whose entire job is to get a genuinely harmful
  self-modification admitted. On its **first run it found a real hole** — a forged proof laundering a
  harmful self-modification. That hole is now closed and locked with a regression test. Current
  result: **0 escapes across 500 adversarial proposals.**
- A mutation harness (`npm run mutation`) that injects known governance-weakening sabotage into the
  safety-critical source and verifies each is caught: **20/20 killed.**
- A generational simulation (`npm run sim:generational`) that runs an adversary trying to erode
  oversight across a long lineage of self-modifications: **0 erosions admitted across 200
  generations.**

These are CI-blocking. A change that weakens governance turns the build red.

## The governance core (runnable code, wired into the agent loop)

| Mechanism | What it enforces |
|-----------|------------------|
| **Adjudicator isolation** | The decision-maker runs in its own thread; killing it yields *paralysis, not freedom* — no capability token can be minted |
| **Canary battery** | A self-modification is judged by its ground-truth nature, not a forgeable proof; missing a known-bad case freezes self-modification |
| **Calibration gate** | An irreversible action may trust the world-model oracle only for an action class with a proven, tamper-evident track record |
| **Semantic tiering** | A fast mechanical floor *routes*; the slow semantic tier is *veto-only* — deny wins everywhere |
| **Generational invariants** | No accepted self-modification lowers the safety floor, removes an oversight mechanism, or raises its own power ceiling without external authorization |
| **Mood coupling** | Affective (PAD) state can only make governance *stricter*, never looser — so manipulating mood is not an attack on safety |

## What this does NOT claim

CogMesh is honest about the frontier. It makes unsafe cognition and unsafe self-modification
**detectable and blockable under stated assumptions** — it does **not** make a strongly
self-improving system safely autonomous, because that isn't available to anyone. Verifying the
*semantic* properties of a self-modification (does this change preserve what the checkable invariants
cannot see?) remains a field-open problem, stated plainly in [THREAT_MODEL.md](THREAT_MODEL.md). Every
mechanism above is a *checkable structural property*, not an unprovable guarantee.

This is a **research preview**: APIs may change, and it is best suited for research, experimentation,
and learning.

## Also in this release

- **Cognitive architecture**: PAD-based metacognition (emotion as the top-level control layer),
  modular reasoning engines that compete and cross-review, a session world model, bounded rationality,
  and a "bring your own brain" bridge for open-source LLMs, commercial APIs, or your own models.
- **Dependency-free core** you can read in an afternoon; the whole architecture is one import away.
- 370 tests passing, lint clean, on Node 20 and 22.

## Getting started

```bash
git clone https://github.com/<your-id>/cogmesh.git
cd cogmesh
npm install
npm test                   # 370 tests
npm run redteam            # watch the adversary fail to break governance
npm run mutation           # 20/20 sabotage mutants killed
```

See the [README](README.md) for the full tour, [CONSTITUTION-REVIEW.md](CONSTITUTION-REVIEW.md) for
the adversarial design review the governance core answers, and
[THREAT_MODEL.md](THREAT_MODEL.md) for the threat model.

## License

Dual-licensed: [AGPL-3.0-or-later](LICENSE) (free, strong copyleft) or a commercial license
(proprietary/closed use). See [LICENSING.md](LICENSING.md).

---

*Built by 심태양 (Shim Taeyang) · © 2026 · Feedback and adversarial findings welcome — see
[SECURITY.md](SECURITY.md).*
