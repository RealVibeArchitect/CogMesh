// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/cognition/CognitiveMesh.js — the whole loop, in one place.
//
// This is the Brain-like Parallel Cognitive Mesh the design document describes: not an
// LLM agent, but a self-revising cycle of thought. It wires the six stages together and
// runs them until the goal is met or the resource budget is spent:
//
//   Generate → Decompose → Parallel Simulation → Evaluation Council (Debate)
//        → Conflict → Synthesis → Regeneration → (repeat) → Self-Improvement
//
// Each stage is an independent module (built and tested on its own); this orchestrator
// only sequences them, moves data between them, and applies resource pressure. It reuses
// the existing mesh — WorldSimulator for futures, PAD for stance, and the reflection
// modules for confidence — rather than reimplementing them.
//
//   const mesh = new CognitiveMesh({ simulator, generate, resources });
//   const result = mesh.run('grow the portfolio safely');
//   result.best;      // the winning candidate
//   result.cycles;    // per-cycle trace
//   result.mesh;      // AdaptiveMesh snapshot (which perspectives wired together)

import { DecompositionEngine } from './DecompositionEngine.js';
import { ParallelWorldSimulation } from './ParallelWorldSimulation.js';
import { EvaluationCouncil } from './EvaluationCouncil.js';
import { buildDefaultCouncil } from './evaluators.js';
import { ConflictEngine, SynthesisEngine, RegenerationEngine } from './ConflictSynthesis.js';
import { AdaptiveMesh } from './AdaptiveMesh.js';
import { ResourceManager } from './ResourceManager.js';
import { RolloutCache } from './RolloutCache.js';
import { StabilityGuard } from './StabilityGuard.js';
import { AttentionManager } from './AttentionManager.js';
import { MetaReasoner } from './MetaReasoner.js';

export class CognitiveMesh {
  /**
   * @param {object} deps
   * @param {import('../world/WorldSimulator.js').WorldSimulator} deps.simulator  required
   * @param {(goal:string, ctx:object)=>Array} [deps.generate]
   *        produce the initial candidates ({ id, action, steps? }) for a goal.
   *        A default generator perturbs the goal-weight fields if none is supplied.
   * @param {DecompositionEngine}       [deps.decomposition]
   * @param {ParallelWorldSimulation}   [deps.simulation]
   * @param {EvaluationCouncil}         [deps.council]
   * @param {RegenerationEngine}        [deps.regeneration]
   * @param {AdaptiveMesh}              [deps.mesh]
   * @param {ResourceManager}           [deps.resources]
   * @param {{ getPadCoord?:Function }} [deps.wiring]  passed to the default council
   * @param {{ beamWidth?:number, steps?:number, convergenceEps?:number }} [deps.config]
   */
  constructor(deps = {}) {
    if (!deps.simulator) throw new Error('[CognitiveMesh] a WorldSimulator is required');
    // Wrap the simulator in a rollout cache (incremental reasoning): the loop re-simulates
    // elite candidates every cycle, so memoizing pure rollouts cuts most of the compute.
    // Opt out with config.cache === false; pass an already-cached simulator and it's reused.
    const cfg = deps.config || {};
    this.simulator = (cfg.cache === false || deps.simulator instanceof RolloutCache)
      ? deps.simulator
      : new RolloutCache(deps.simulator, { max: cfg.cacheSize });
    this._generate = typeof deps.generate === 'function' ? deps.generate : null;

    this.beamWidth = Number.isFinite(cfg.beamWidth) ? cfg.beamWidth : 12;
    this.steps = Number.isFinite(cfg.steps) ? cfg.steps : 1;
    this.convergenceEps = Number.isFinite(cfg.convergenceEps) ? cfg.convergenceEps : 1e-6;

    this.decomposition = deps.decomposition || new DecompositionEngine();
    // Attention: choose which perspectives to think about for the situation, instead of
    // always splitting into all ~10. Fewer, more-relevant nodes → less compute + better
    // focus. Opt out with config.attention === false.
    this.attention = deps.attention
      || (cfg.attention === false ? null : new AttentionManager({ topK: cfg.attentionTopK }));
    // Meta-Reasoner: pick HOW to think (intuitive / deliberate / divergent / skeptical) and
    // reconfigure the mesh's knobs to match. Opt out with config.metaReason === false.
    this.metaReasoner = deps.metaReasoner
      || (cfg.metaReason === false ? null : new MetaReasoner());
    this._getPadCoord = deps.wiring?.getPadCoord || null;
    this.simulation = deps.simulation || new ParallelWorldSimulation(this.simulator, { beamWidth: this.beamWidth, steps: this.steps, diversityGuard: true });
    this.council = deps.council || new EvaluationCouncil(
      buildDefaultCouncil({ getPadCoord: deps.wiring?.getPadCoord, getGoalText: () => this._activeGoal }),
      { debateRounds: 1 }
    );
    this.regeneration = deps.regeneration || new RegenerationEngine({
      conflict: new ConflictEngine(),
      synthesis: new SynthesisEngine(),
      elite: 2, pairs: 2,
    });
    this.mesh = deps.mesh || new AdaptiveMesh({ learningRate: 0.25, decayRate: 0.05, pruneThreshold: 0.05 });
    this.resources = deps.resources || new ResourceManager({ maxRollouts: 400, maxCycles: 6 });
    // Stability supervisor: isolates poisoned (NaN/Infinity) candidates before they can
    // become synthesis feedstock, and detects plateaus via patience (more robust than a
    // single-epsilon convergence check). Opt out with config.stability === false.
    this.stability = deps.stability
      || (cfg.stability === false ? null : new StabilityGuard({ patience: cfg.patience, minDelta: cfg.convergenceEps }));

    this._activeGoal = '';
    this._recentFocus = [];
  }

  /**
   * Run the full cognitive cycle for a goal.
   * @param {string} goal
   * @param {object} [ctx]  passed to generator, decomposition, and council
   * @returns {{ best:object|null, bestScore:number, cycles:Array,
   *             mesh:object, resources:object, stopReason:string }}
   */
  run(goal, ctx = {}) {
    this._activeGoal = (goal ?? '').toString();
    this.resources.reset();
    if (this.stability) this.stability.reset();

    // META-REASONING: choose a strategy for HOW to think, then reconfigure the mesh to it.
    // Signals come from ctx (complexity/stakes/etc., e.g. from boundedRationality) and mood.
    this._strategy = null;
    if (this.metaReasoner) {
      const pad = this._getPadCoord ? safeCall(this._getPadCoord) : null;
      const sel = this.metaReasoner.select({
        complexity: ctx.complexity, uncertainty: ctx.uncertainty,
        stakes: ctx.stakes, novelty: ctx.novelty, verify: ctx.verify, pad,
      });
      this._strategy = sel;
      this._applyStrategy(sel.config);
    }

    let candidates = this._seed(this._activeGoal, ctx);
    let best = null;
    let bestScore = -Infinity;
    const cycles = [];

    for (;;) {
      const gate = this.resources.shouldContinue({
        goalReached: false,
        converged: false,
      });
      if (!gate.continue) { cycles._stop = gate.reason; break; }

      const prevBest = bestScore;
      const cycle = this._cycle(candidates, ctx);
      cycles.push(cycle);

      // track global best
      if (cycle.best && cycle.best.councilScore > bestScore) {
        best = cycle.best;
        bestScore = cycle.best.councilScore;
      }

      this.resources.tickCycle({ best: bestScore, admitted: cycle.admitted });

      // STABILITY: record the trajectory and let the guard decide on plateau/instability via
      // patience (more robust than a single-cycle epsilon check). Falls back to the original
      // single-eps convergence when the guard is disabled.
      let converged;
      if (this.stability) {
        this.stability.record(bestScore);
        const v = this.stability.verdict();
        converged = v.stop;
        if (converged) cycles._stabilityReason = v.reason;
      } else {
        const improvement = bestScore - prevBest;
        converged = this.resources.cycles > 1 && prevBest > -Infinity
          && improvement < this.convergenceEps;
      }

      const gate2 = this.resources.shouldContinue({ converged });
      if (!gate2.continue) { cycles._stop = gate2.reason; break; }

      // feed the regenerated candidates back into Generate
      candidates = cycle.nextGeneration.length ? cycle.nextGeneration : candidates;
      // mesh maintenance between cycles (forget, prune)
      this.mesh.tick();
    }

    return {
      best,
      bestScore: bestScore === -Infinity ? 0 : bestScore,
      cycles,
      stopReason: cycles._stop || cycles._stabilityReason || 'completed',
      strategy: this._strategy ? { name: this._strategy.strategy, rationale: this._strategy.rationale } : null,
      stability: this.stability ? this.stability.status() : null,
      mesh: this.mesh.snapshot(),
      resources: this.resources.status(),
    };
  }

  /**
   * Reconfigure the mesh's knobs to a chosen strategy's config. Rebuilds only what changed
   * (beam width, attention breadth, debate rounds, exploration temperature, synthesis
   * aggressiveness), so switching strategy per-run is cheap and side-effect-free.
   */
  _applyStrategy(cfg = {}) {
    if (Number.isFinite(cfg.beamWidth)) {
      this.beamWidth = cfg.beamWidth;
      this.simulation.beamWidth = cfg.beamWidth;
    }
    if (Number.isFinite(cfg.steps)) this.steps = cfg.steps;
    if (this.attention && Number.isFinite(cfg.attentionTopK)) this.attention.topK = cfg.attentionTopK;
    if (this.council && Number.isFinite(cfg.debateRounds)) this.council.debateRounds = cfg.debateRounds;
    if (this.regeneration) {
      if (Number.isFinite(cfg.pairs)) this.regeneration.pairs = cfg.pairs;
      if (Number.isFinite(cfg.elite)) this.regeneration.elite = cfg.elite;
    }
    // exploration/temperature is carried for evaluators that read it (PAD emotion lens)
    if (Number.isFinite(cfg.exploration)) this._exploration = cfg.exploration;
  }

  // ── one full cycle: decompose → simulate → evaluate → conflict/synthesize → regen ──
  _cycle(candidates, ctx) {
    // 0) ATTENTION — decide which perspectives to think about for this situation, so we
    // decompose into the relevant few rather than all ~10 (less compute, sharper focus).
    let decomposeOpts = ctx;
    let attentionScores = null;
    if (this.attention) {
      const pad = this._getPadCoord ? safeCall(this._getPadCoord) : null;
      const { attended, scores } = this.attention.attend({ goal: this._activeGoal, pad, recentFocus: this._recentFocus });
      this._recentFocus = attended;
      attentionScores = scores;
      decomposeOpts = { ...ctx, perspectives: attended };
    }

    // 1) DECOMPOSE each candidate into the attended perspective thought-nodes
    const nodes = this.decomposition.decomposeAll(candidates, decomposeOpts);

    // attention also assigns node priority, so a tight budget admits high-attention first.
    // Reuses the salience scores attend() just computed — one model per cycle, no recompute.
    const focused = this.attention
      ? this.attention.prioritize(nodes, { goal: this._activeGoal }, attentionScores)
      : nodes;

    // register this cohort in the adaptive mesh (siblings from one candidate interconnect)
    this._wireCohort(focused);

    // 2) PARALLEL SIMULATION with resource admission
    const promise = this._estimatePromise(candidates);
    const budgetView = {
      affordableCount: (want) => this.resources.affordableCount(want, { promise }),
    };
    const sim = this.simulation.simulate(focused, { budget: budgetView, steps: this.steps });
    this.resources.charge(sim.simulated.length);

    // STABILITY: drop poisoned (NaN/Infinity) candidates BEFORE ranking, so a bad score can
    // never survive into the council, synthesis, or the next generation.
    const cleanSimulated = this.stability ? this.stability.sanitize(sim.simulated).clean : sim.simulated;

    // 3) EVALUATION COUNCIL with debate/peer-review
    const { ranked } = this.council.deliberate(cleanSimulated, ctx);

    // reinforce the mesh: the top candidates' perspective-nodes wired together = corroboration
    this._reinforceWinners(ranked);

    // 4) CONFLICT + SYNTHESIS → 5) REGENERATION
    // council results carry .candidate (the node) + .councilScore; lift score onto the node
    const scored = ranked.map((r) => ({ ...r.candidate, councilScore: r.councilScore, agreement: r.agreement, summary: r.summary }));
    // Synthesis is only meaningful across *distinct* ideas, so collapse the beam to the
    // best node per origin-candidate first. Many nodes are just different perspective-lenses
    // of the same action; colliding those yields nothing. Best-per-origin gives the
    // ConflictEngine genuinely different archetypes to reconcile.
    const diverse = bestPerOrigin(scored);
    const { nextGeneration, syntheses } = this.regeneration.regenerate(diverse);

    return {
      admitted: sim.simulated.length,
      pruned: sim.pruned.length,
      best: ranked[0] ? { ...ranked[0].candidate, councilScore: ranked[0].councilScore, agreement: ranked[0].agreement, summary: ranked[0].summary } : null,
      ranked: scored,
      syntheses,
      nextGeneration,
    };
  }

  // ── default candidate generator ────────────────────────────────────────────
  // If the caller didn't supply generate(), perturb the simulator's tracked goal fields to
  // create a spread of starting candidates. This keeps the mesh runnable out of the box.
  _seed(goal, ctx) {
    if (this._generate) {
      const out = this._generate(goal, ctx);
      return Array.isArray(out) && out.length ? out : this._defaultSeed();
    }
    return this._defaultSeed();
  }

  _defaultSeed() {
    const snap = this.simulator.world.getFieldSnapshot();
    const keys = Object.keys(snap).filter((k) => typeof snap[k] === 'number');
    if (keys.length === 0) {
      return [{ id: 'c0', action: {} }, { id: 'c1', action: {} }];
    }
    // Archetypes that differ across MULTIPLE fields, so the ConflictEngine finds real
    // tension to reconcile (e.g. aggressive pushes the primary up but also a secondary
    // "risk"-like field up; conservative does the opposite). If there's only one field,
    // we still spread it across three magnitudes.
    const primary = keys[0];
    const secondary = keys[1] || null;
    const base = snap[primary];
    const sBase = secondary ? snap[secondary] : 0;
    const mk = (id, pMul, sMul) => {
      const field = { [primary]: base * pMul };
      if (secondary) field[secondary] = sBase * sMul;
      return { id, action: { field } };
    };
    return [
      mk('aggressive', 1.5, 1.6),   // more upside, more of the secondary signal
      mk('balanced', 1.15, 1.0),    // moderate on both
      mk('conservative', 0.98, 0.4),// protect the secondary at the cost of upside
    ];
  }

  _estimatePromise(candidates) {
    // simple promise proxy: more candidates & any structure → spend a bit more
    const n = Array.isArray(candidates) ? candidates.length : 0;
    return Math.max(0.3, Math.min(0.9, n / 20 + 0.3));
  }

  _wireCohort(nodes) {
    // group nodes by their originating candidate; siblings interconnect weakly
    const groups = new Map();
    for (const n of nodes) {
      const g = n.parentId || 'root';
      (groups.get(g) || groups.set(g, []).get(g)).push(n);
    }
    for (const [, group] of groups) {
      this.mesh.addCohort(group, { interconnect: true, initialWeight: 0.1 });
    }
  }

  _reinforceWinners(ranked) {
    const topK = ranked.slice(0, Math.max(2, Math.ceil(ranked.length * 0.3)));
    const ids = topK.map((r) => r.candidate.id).filter(Boolean);
    // co-successful perspective-nodes strengthen their links (Hebbian)
    this.mesh.reinforceGroup(ids, 1);
  }
}

/**
 * Keep only the highest-scoring node per originating candidate. Nodes carry
 * meta.origin (the source candidate id); ties fall back to the node's own id. The result
 * preserves the ranking order and gives downstream synthesis genuinely distinct actions.
 */
/** Call a getter defensively; return null on any error so attention degrades gracefully. */
function safeCall(fn) {
  try { return fn(); } catch { return null; }
}

function bestPerOrigin(scored) {
  const seen = new Map();
  for (const node of scored) {
    const origin = node.meta?.origin ?? node.parentId ?? node.id;
    const prev = seen.get(origin);
    if (!prev || (node.councilScore ?? -Infinity) > (prev.councilScore ?? -Infinity)) {
      seen.set(origin, node);
    }
  }
  // preserve best-first order
  return [...seen.values()].sort((a, b) => (b.councilScore ?? 0) - (a.councilScore ?? 0));
}
