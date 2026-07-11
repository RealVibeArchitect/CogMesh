// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/CogMeshAgent.js — the whole system, working as one.
//
// Each subsystem was built and tested on its own; this is where they compose into a single
// cognitive agent that perceives, remembers, thinks, acts, and learns:
//
//     PERCEIVE   multimodal encoders turn text/image/video into vectors (shared space)
//         ↓
//     REMEMBER   semantic retrieval recalls relevant past facts/episodes for context
//         ↓
//     ORIENT     the meta-reasoner picks a reasoning strategy for the situation
//         ↓
//     THINK      the cognitive mesh reasons (attention → simulate → debate → synthesize),
//                supervised by the StabilityGuard, to reach a decision
//         ↓
//     ACT        the agent loop grounds the decision in the world via tools
//         ↓
//     LEARN      the outcome is written back to memory (embedded), so next time RECALL is richer
//
// The point of the integration is that these stages SHARE state: perception feeds the same
// vector space retrieval searches; recalled memories become context for thinking; the mesh
// can drive tool selection; and acting produces memories that improve future recall. It's a
// closed loop, not a pipeline that runs once.
//
// Everything is optional/injectable: give it only a mesh and it just thinks; add a retriever
// for memory, tools for grounding, encoders for multimodality. Missing pieces degrade
// gracefully rather than erroring.

export class CogMeshAgent {
  /**
   * @param {object} deps
   * @param {import('./cognition/CognitiveMesh.js').CognitiveMesh} deps.mesh   the reasoning core (required)
   * @param {import('./retrieval/SemanticRetriever.js').SemanticRetriever} [deps.retriever]  long-term memory
   * @param {import('./agent/AgentLoop.js').AgentLoop} [deps.agent]            tool-use loop for grounding
   * @param {object} [deps.imageEncoder]   multimodal image encoder ({ embed })
   * @param {object} [deps.videoEncoder]   multimodal video encoder ({ embed })
   * @param {{ recallK?:number, minRecallScore?:number }} [deps.config]
   */
  constructor(deps = {}) {
    if (!deps.mesh) throw new Error('[CogMeshAgent] a CognitiveMesh is required');
    this.mesh = deps.mesh;
    this.retriever = deps.retriever || null;
    this.agent = deps.agent || null;
    this.imageEncoder = deps.imageEncoder || null;
    this.videoEncoder = deps.videoEncoder || null;
    // OPTIONAL governance. If provided, the LEARN step (memory formation) is gated: writing a memory
    // changes behavior-determining state (future recall steers future reasoning), so per the
    // -TERMINATION finding it is treated as power-increasing and requires the persistence gate /
    // external anchor. Absent it, the agent learns freely (existing behavior unchanged).
    this.constitution = deps.constitution || null;
    // OPTIONAL cross-partition flow control. Recalled MEMORY is a FLUID region (it is self-modified
    // every LEARN step); the reasoning MESH is a FROZEN region (trusted logic). Letting recalled
    // memory flow into reasoning is a fluid→frozen flow — exactly the residual threat -PARTITION
    // warned of (a frozen planner consuming a misaligned learned heuristic). When a PartitionFlowController
    // is provided, that flow is governed: FORBID isolates reasoning from memory; ANCHOR admits only
    // anchor-approved memories. Absent it, recall feeds reasoning freely (existing behavior).
    this.partitionFlow = deps.partitionFlow || null;
    this.memoryRegion = deps.memoryRegion || 'memory';       // the FLUID producer
    this.reasoningRegion = deps.reasoningRegion || 'reasoning'; // the FROZEN consumer
    const cfg = deps.config || {};
    this.recallK = Number.isFinite(cfg.recallK) ? cfg.recallK : 3;
    this.minRecallScore = Number.isFinite(cfg.minRecallScore) ? cfg.minRecallScore : 0;
    this._episodeSeq = 0;
    // one constitutional session spans the agent's life (memories accumulate across runs)
    this._govCtx = this.constitution ? this.constitution.admit({ origin: 'cogmesh-agent' }).ctx : null;
  }

  /**
   * Run one full perceive→remember→think→act→learn cycle for a goal.
   * @param {string} goal
   * @param {{ image?:object, video?:Array, context?:object, act?:boolean }} [input]
   *   image/video: optional perception inputs (decoded pixels / frame array).
   *   context:     extra signals for reasoning (complexity/stakes/etc. for the meta-reasoner).
   *   act:         if true and an agent loop is present, ground the decision via tools.
   * @returns {Promise<object>} a trace of every stage
   */
  async run(goal, input = {}) {
    const trace = { goal, stages: {} };

    // ── PERCEIVE ─────────────────────────────────────────────────────────
    // Encode any multimodal input into the shared vector space. The vector becomes both a
    // retrieval key (find visually/textually similar memories) and a perception record.
    const perception = await this._perceive(goal, input);
    trace.stages.perceive = { modality: perception.modality, hasVector: !!perception.vector };

    // ── REMEMBER ─────────────────────────────────────────────────────────
    // Recall relevant memories by meaning. These become context the mesh reasons with.
    const recalled = await this._remember(goal, perception);
    trace.stages.remember = { recalled: recalled.map((r) => ({ text: r.text ?? r.key, score: round(r.score) })) };

    // ── ORIENT + THINK ───────────────────────────────────────────────────
    // The mesh reasons over the goal + recalled context. Its own meta-reasoner picks the
    // strategy; the stability guard keeps self-improvement honest.

    // ── GOVERN cross-partition flow: recalled memory (FLUID) → reasoning (FROZEN) ──
    // Before recalled memory may influence the frozen reasoning region, the flow is evaluated.
    // FORBID → reasoning is isolated from memory (recalled dropped). ANCHOR → only anchor-approved
    // memories pass. This governs the FLOW, not the code: freezing the mesh's code would not stop a
    // misaligned memory from steering it, so we gate the memory's entry instead.
    let admittedRecall = recalled;
    if (this.partitionFlow) {
      const flow = this.partitionFlow.evaluate({
        fromRegion: this.memoryRegion,
        toRegion: this.reasoningRegion,
        // a memory is anchor-approved if it was tagged so when it cleared the persistence gate;
        // here we treat memories carrying meta.anchorApproved === true as approved.
        anchorApproved: false, // evaluated per-memory below for ANCHOR policy
      });
      if (flow.policy === 'forbid' && !flow.allow) {
        admittedRecall = []; // isolation: reasoning proceeds without any recalled memory
      } else if (flow.policy === 'anchor') {
        // admit only memories the anchor approved (payload.anchorApproved === true)
        admittedRecall = recalled.filter((r) => r.payload?.anchorApproved === true);
      }
      trace.stages.partitionFlow = {
        policy: flow.policy,
        recalledCount: recalled.length,
        admittedCount: admittedRecall.length,
        reason: flow.reason,
      };
    }

    const ctx = { ...(input.context || {}), recalled: admittedRecall };
    const thought = this.mesh.run(goal, ctx);
    trace.stages.think = {
      strategy: thought.strategy?.name || null,
      bestScore: round(thought.bestScore),
      stopReason: thought.stopReason,
      stability: thought.stability ? { trend: thought.stability.trend, poisonedDropped: thought.stability.poisonedDropped } : null,
    };

    // ── ACT ──────────────────────────────────────────────────────────────
    // Optionally ground the decision in the world through the tool-use loop.
    let action = null;
    if (input.act && this.agent) {
      action = await this.agent.run(goal, { decision: thought.best, recalled });
      trace.stages.act = { answer: action.answer, steps: action.steps, stopReason: action.stopReason };
    }

    // ── LEARN ────────────────────────────────────────────────────────────
    // Write the outcome back to memory so future recall is richer. This is what makes it a
    // loop rather than a pipeline: acting changes what we remember.
    const learned = await this._learn(goal, thought, action, perception);
    trace.stages.learn = learned;

    return {
      goal,
      decision: thought.best,
      bestScore: thought.bestScore,
      answer: action ? action.answer : null,
      recalled,
      strategy: thought.strategy,
      stability: thought.stability,
      trace,
    };
  }

  // ── PERCEIVE ────────────────────────────────────────────────────────────
  async _perceive(goal, input) {
    try {
      if (input.video && this.videoEncoder) {
        return { modality: 'video', vector: await this.videoEncoder.embed(input.video) };
      }
      if (input.image && this.imageEncoder) {
        return { modality: 'image', vector: await this.imageEncoder.embed(input.image) };
      }
      // text-only: if the retriever has a text provider, embed the goal for symmetric recall
      if (this.retriever?.provider?.embed) {
        return { modality: 'text', vector: await this.retriever.provider.embed(goal) };
      }
    } catch {
      // perception is best-effort — a failing encoder must not break the whole cycle
    }
    return { modality: 'text', vector: null };
  }

  // ── REMEMBER ────────────────────────────────────────────────────────────
  async _remember(goal, perception) {
    if (!this.retriever) return [];
    // For multimodal input, query by the perceived vector directly (cross-modal recall).
    // For text, query by the goal string (the retriever embeds it).
    try {
      if (perception.modality !== 'text' && perception.vector) {
        return await this._queryByVector(perception.vector);
      }
      return await this.retriever.query(goal, { k: this.recallK, minScore: this.minRecallScore });
    } catch {
      return []; // recall is best-effort — never let it break the cycle
    }
  }

  // vector query (the retriever's public API is text-based; this reaches the same index)
  async _queryByVector(vec) {
    const { cosine } = await import('./retrieval/EmbeddingProvider.js');
    const items = [...this.retriever._items.values()];
    return items
      .map((it) => ({ text: it.text, payload: it.payload, score: cosine(vec, it.vec) }))
      .filter((h) => h.score >= this.minRecallScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.recallK);
  }

  // ── LEARN ───────────────────────────────────────────────────────────────
  async _learn(goal, thought, action, perception) {
    if (!this.retriever) return { stored: false };
    // Compose a memory of what happened: the goal, the outcome, and (if acted) the result.
    const outcome = action ? `→ ${JSON.stringify(action.answer)}` : `(score ${round(thought.bestScore)})`;
    const text = `${goal} ${outcome}`;

    // ── GOVERN: memory formation changes behavior-determining state ──────────
    // Writing a memory steers future recall, which steers future reasoning — so per the
    // -TERMINATION finding this is NOT reach-conservative-therefore-safe; it is a power-increasing
    // change that must clear the persistence gate. Without an external anchor the runtime withholds
    // the write (a HALT is recorded in the trace, never a crash). This is the abstract principle
    // "learning requires external sign-off" made into an actual runtime behavior.
    if (this.constitution) {
      const intent = {
        action: 'memory:persist',
        touchesBehaviorDeterminingState: true, // → S2 classifies as power-increasing → escalate
        isSelfModification: false,
        text,
      };
      const gated = this.constitution.gate(intent, this._govCtx);
      this._govCtx = gated.ctx;
      if (!gated.verdict.permits) {
        return {
          stored: false,
          withheld: true,
          verdict: gated.verdict.name,
          reason: gated.verdict.reason,
        };
      }
    }

    try {
      const id = await this.retriever.add(text, {
        goal, bestScore: thought.bestScore,
        answer: action?.answer ?? null,
        strategy: thought.strategy?.name ?? null,
        modality: perception.modality,
        episode: ++this._episodeSeq,
      });
      return { stored: true, id, text };
    } catch {
      return { stored: false };
    }
  }

  /** Read-only access to the governance trajectory (present only when governed). */
  get governanceTrajectory() {
    return this.constitution ? this.constitution.trajectory : null;
  }
}

const round = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : v);
