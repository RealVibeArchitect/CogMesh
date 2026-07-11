<!--
SPDX-License-Identifier: AGPL-3.0-or-later
CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
-->

# CogMesh Architecture

This document is the map a new contributor needs: what the modules are, how data flows
between them, and where to make a given kind of change. CogMesh is **not** an LLM agent —
it is a *brain-like parallel cognitive mesh*: a self-revising cycle of thought that runs
locally on a World Model, with an optional learned emotion (PAD) encoder.

> New here? Read this file top-to-bottom once, then run `node examples/cognitive-mesh.mjs`
> and re-read the [cognitive cycle](#the-cognitive-cycle) with the output in front of you.

---

## CogMesh Constitution — the highest governing layer

> **This section governs everything below it.** Every module described later in this
> document — Safety Kernel, PAD, World Model, Memory, Planner, Specialist Engines, Tool
> Router, Learning, Self-Improvement, and any future module — explicitly **inherits and
> operates under the Constitution.** The Constitution is not a module in `core/` among peers;
> it is the layer *above* all of them.

The Constitution is CogMesh's top governing layer. It is consulted **before reasoning begins**
(not as an output filter), stays active through the entire cognitive loop, and is the only
layer that may authorize irreversible actions (tool use, output, persistence, self-change).

**Authority runs in two directions.** Downward, the Constitution attaches a *constitutional
context* of constraints that every stage must honor and may only tighten, never loosen.
Upward, every module must **report up** to the Constitution before any irreversible step and
receive a go/no-go. Governance is therefore continuous, not a one-time gate at the entrance.

**Layer hierarchy (highest first):**

```
  L0  Constitution        — governs the right to reason, act, learn, self-modify
  L1  Safety Kernel        — non-bypassable enforcement of the Constitution's hard floor
  L2  Metacognition        — Meta-Reasoner · PAD · Attention · Bounded Rationality · Stability
  L3  Cognition            — Goal · World Model · Planner · Cognitive Mesh · Specialist Engines
  L4  Grounding            — Tool Router / Execution · Multimodal Perception
  L5  Memory & Learning    — Memory · Retrieval · Learning · Self-Improvement
```

Everything in the sections that follow lives at **L1–L5 and operates under L0.** The module
map, cognitive cycle, and invariants below describe *how* those governed layers work; **why
and how they are governed** — the layer hierarchy, control flow, gates, enforcement,
inheritance, and self-modification validation — is specified in the dedicated design
document:

**→ See [CONSTITUTION.md](CONSTITUTION.md) for the full Constitution architecture.**

The existing invariants in this document ("imagination never touches reality," "the loop
always terminates," "self-improvement is supervised") are **enforced consequences of the
Constitution**, not conventions each module maintains on its own.

---

## Top-level integration: `CogMeshAgent`

`core/CogMeshAgent.js` composes every subsystem into one perceive→remember→think→act→learn
loop — the whole system working as a single mind:

```
  PERCEIVE  multimodal encoders → vectors (shared space)
     ↓
  REMEMBER  semantic retrieval recalls relevant past episodes as context
     ↓
  ORIENT    the meta-reasoner picks a strategy for the situation
     ↓
  THINK     the cognitive mesh reasons (stability-supervised) to a decision
     ↓
  ACT       the agent loop grounds the decision through tools
     ↓
  LEARN     the outcome is embedded back into memory → richer recall next time
```

The stages **share state**, so it's a closed loop: acting produces memories that improve
future recall. Everything is injectable — give it only a mesh and it just thinks; add a
retriever, tools, and encoders to light up the rest. See `examples/full-agent.mjs`.

## 30-second mental model

```
            ┌──────────────────────── core/cognition ────────────────────────┐
  goal ─▶   │  MetaReasoner → Attention → Decompose → Parallel Simulation      │
            │      (how)        (what)      (split)       (imagine futures)     │
            │        │            │            │                 │             │
            │        ▼            ▼            ▼                 ▼             │
            │   Evaluation Council (debate) → Conflict → Synthesis → Regenerate │  ─▶ best
            │        │                                            │             │
            │        └────────── AdaptiveMesh + ResourceManager ──┘             │
            └─────────────────────────────────────────────────────────────────┘
                     ▲ reads PAD mood            ▲ reasons in World Model
              core/pad (emotion)           core/world (imagination)
```

Every future is imagined on a **branched copy** of the World Model — reality is never
mutated. The loop repeats until the goal is met or the resource budget is spent.

---

## Module map (`core/`)

Every module operates **under the Constitution (L0)**; the *Layer* column shows where each
sits in the [governance hierarchy](#cogmesh-constitution--the-highest-governing-layer).

| Module | Layer | Role | Key files |
|--------|-------|------|-----------|
| **cognition/** | L2–L3 | The brain-like reasoning cycle (13 files) | `CognitiveMesh.js` (orchestrator), `MetaReasoner.js`, `AttentionManager.js`, `DecompositionEngine.js`, `ParallelWorldSimulation.js`, `EvaluationCouncil.js` + `evaluators.js`, `ConflictSynthesis.js`, `AdaptiveMesh.js`, `ResourceManager.js`, `RolloutCache.js`, `WorkerPool.js`, `StabilityGuard.js` |
| **world/** | L3 | The "imagination": a mutable world + branchable simulator (foresees consequences for pre-action governance) | `WorldModel.js`, `WorldSimulator.js` |
| **pad/** | L2 | Pleasure-Arousal-Dominance emotion as a metacognitive layer (may only *tighten* constraints) | `padState.js`, `metacognition.js`, `emotionMap.js` |
| **memory/** | L5 | Human-like tiered memory + compression (writes pass the persistence gate) | `WorkingMemory.js`, `SemanticMemory.js`, `EpisodeMemory.js`, `ReflectionMemory.js`, `MemoryCompressor.js` |
| **retrieval/** | L5 | Local RAG-like semantic recall (MiniLM ONNX + lexical fallback) | `EmbeddingProvider.js`, `SemanticRetriever.js` |
| **agent/** | L4 | Real-world grounding: tools + observe-decide-act loop (acts pass the pre-action gate) | `Tool.js`, `AgentLoop.js`, `meshPolicy.js` |
| **multimodal/** | L4 | Images & video in the shared retrieval vector space (CLIP ONNX + pixel fallback) | `ImageEncoder.js`, `VideoEncoder.js` |
| **reflection/** | L2 | Confidence + self-correction (uncertainty) | `confidence.js`, `selfCorrection.js` |
| **orchestrator/** | L3 | Planning, goals, bounded-rationality budgeting | `planner.js`, `goalManager.js`, `boundedRationality.js`, `deliberativeLoop.js` |
| **mesh/** | L3 | Domain-engine routing + review | `MeshRouter.js`, `EngineRegistry.js`, `reviewTypes.js` |
| **util/** | — | Shared helpers | — |
| *(Constitution)* | **L0** | Highest governing layer — *architecture defined in [CONSTITUTION.md](CONSTITUTION.md); not yet a `core/` module* | *(design phase)* |
| *(Safety Kernel)* | **L1** | Non-bypassable enforcement floor — *design phase* | *(design phase)* |

`engines/` (outside `core/`) holds pluggable domain engines (`finance`, `legal`, `coding`,
`general`) — currently interface stubs, wired through `mesh/MeshRouter`.

---

## The cognitive cycle

The heart of the system is `core/cognition/CognitiveMesh.js`. One call to `run(goal, ctx)`
executes this loop until the `ResourceManager` says stop:

```
  META-REASON   MetaReasoner picks HOW to think (intuitive / deliberate / divergent /
                skeptical) and reconfigures the mesh's knobs (beam width, debate rounds,
                attention breadth, exploration).                      ── decide the mode
        │
  ATTEND        AttentionManager scores perspectives for the situation and keeps the top
                few (safety always on). Fewer, more relevant nodes.   ── decide what to think about
        │
  DECOMPOSE     Each candidate splits into the attended perspective thought-nodes.
        │
  SIMULATE      ParallelWorldSimulation rolls every node into its own future on a branched
                world. Beam-pruned, budget-admitted, cached, optionally worker-parallel.
        │
  EVALUATE      EvaluationCouncil: many evaluators score each candidate, then DEBATE and
                peer-review — a peer-weighted verdict, never a flat average.
        │
  CONFLICT      Top distinct candidates are collided; tensions analyzed.
  SYNTHESIZE    Conflicts fuse into genuinely new candidates.
  REGENERATE    Elites + syntheses become the next generation → back to DECOMPOSE.
        │
  SELF-IMPROVE  AdaptiveMesh reinforces co-successful perspective links (Hebbian); the
                ResourceManager decays the budget; convergence/goal/limit ends the loop.
```

### Where each concern lives

- **How to think** → `MetaReasoner.js` (strategy) + `orchestrator/boundedRationality.js` (depth)
- **What to think about** → `AttentionManager.js`
- **Imagining outcomes** → `world/WorldSimulator.js` (+ `RolloutCache.js`, `WorkerPool.js`)
- **Judging** → `EvaluationCouncil.js` + `evaluators.js` (which reuse PAD / confidence / world score)
- **Creating new ideas** → `ConflictSynthesis.js`
- **Learning across cycles** → `AdaptiveMesh.js`
- **Staying within budget** → `ResourceManager.js`

---

## Performance stack

Three composable optimizations, each measured, each independently toggleable:

1. **Attention** narrows ~10 perspectives to the relevant few (≈50% fewer nodes).
2. **RolloutCache** memoizes pure rollouts across cycles (≈93% fewer real simulations).
3. **WorkerPool** spreads the remaining unique rollouts across CPU cores (auto-falls-back
   below a work threshold or on single-core machines).

They multiply: focus first, dedupe second, parallelize what's left. See
`examples/worker-benchmark.mjs` to measure the parallel speedup on your own hardware.

---

## The learned PAD path (Python ↔ JS)

The JS core and the Python trainer are **decoupled** — they meet only through an exported
ONNX file, never a live IPC bridge:

```
  training/ (Python)                         core/pad (JS)
  ┌───────────────────────┐                  ┌──────────────────────┐
  │ seed_emotions.jsonl    │  train  ─▶ .pt   │ emotionMap.js         │
  │ MiniLM + LoRA (model.py)│  export ─▶ .onnx │ (20 core PAD coords)  │
  └───────────────────────┘         +tokenizer └──────────────────────┘
```

The 20 core-emotion PAD coordinates exist in **both** `core/pad/emotionMap.js` and
`training/src/utils.py` and MUST stay identical — `scripts/check-pad-sync.mjs`
(`npm run check:pad-sync`) fails CI if they drift.

---

## Design invariants (don't break these)

- **Imagination never touches reality.** All rollouts run on `world.branch()`; the live
  World Model is read-only during simulation.
- **The loop always terminates.** Every path is bounded by `ResourceManager`
  (cycles / rollouts / wall-clock) plus convergence detection.
- **Evaluation is a debate, not an average.** The council peer-weights verdicts.
- **Optimizations are transparent.** Cache and workers must return results identical to the
  naive path; they change speed, never outcomes.
- **PAD coordinates are single-sourced** across JS and Python (enforced by the sync check).
- **Self-improvement is supervised.** A `StabilityGuard` isolates non-finite (NaN/Infinity)
  candidates before they can propagate through synthesis, and stops the loop on plateau
  (patience) or instability rather than thrashing.
- **ESM only.** No CommonJS (`require`) anywhere in `core/`.

---

## Testing

```
npm test                 # full suite (node --test)
npm run test:cognition   # the cognitive cycle
npm run check:pad-sync   # JS↔Python PAD coordinate guard
```

Tests live in `test/*.mjs`, one file per concern. Add a test with any new module, and keep
the "optimizations are transparent" invariant covered (compare against the naive path).

---

## Where to make changes

| I want to… | Go to |
|------------|-------|
| Add a reasoning strategy (e.g. "analogical") | `cognition/MetaReasoner.js` (`STRATEGIES`) |
| Change what the mesh focuses on | `cognition/AttentionManager.js` (`DEFAULT_SALIENCE`) |
| Add a new evaluator to the council | `cognition/evaluators.js` |
| Change how futures are scored | `world/WorldSimulator.js` (`scoreFn` / `goalWeights`) |
| Add a domain engine | `engines/<domain>/index.js` + register in `mesh/EngineRegistry` |
| Tune emotion → behavior | `pad/metacognition.js` |
| Adjust memory capacity/eviction | `memory/*.js` |
