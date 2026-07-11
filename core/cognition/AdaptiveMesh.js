// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/cognition/AdaptiveMesh.js — thought-nodes as a graph, not a tree.
//
// The document is emphatic: thoughts form a MESH, not a TREE. Nodes connect laterally
// (A ↔ B ↔ C ↔ D), connection weights change with experience, useful links strengthen,
// dead links are pruned, and new links form. This module is that substrate: an undirected
// weighted graph over thought-nodes with Hebbian-style weight adaptation.
//
//     A ──0.8── B                "nodes that evaluate well *together* wire together"
//     │         │                 reinforce(A,B): w ← w + η(1-w)   (co-success)
//    0.3       0.6                decay():        w ← w·(1-δ)      (forgetting)
//     │         │                 prune():        drop w < θ        (dead links)
//     C ──0.5── D
//
// It's a plain data structure with no scheduling opinions — the CognitiveMesh orchestrator
// decides *when* to reinforce/decay. Kept dependency-free and serializable (snapshot()).

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class AdaptiveMesh {
  /**
   * @param {{ learningRate?:number, decayRate?:number, pruneThreshold?:number,
   *           maxDegree?:number }} [opts]
   *   learningRate η: how fast a co-successful link strengthens (0~1, default 0.2)
   *   decayRate    δ: per-decay-step forgetting (0~1, default 0.05)
   *   pruneThreshold θ: links below this weight are removed (default 0.05)
   *   maxDegree:    cap on connections per node (weakest link drops when exceeded)
   */
  constructor(opts = {}) {
    this.eta = clamp01(opts.learningRate ?? 0.2);
    this.delta = clamp01(opts.decayRate ?? 0.05);
    this.theta = clamp01(opts.pruneThreshold ?? 0.05);
    this.maxDegree = Number.isFinite(opts.maxDegree) ? opts.maxDegree : Infinity;
    this._nodes = new Map();      // id → node
    this._edges = new Map();      // "id1|id2" (sorted) → weight
    this._adj = new Map();        // id → Set(neighborId)
  }

  /** Add (or refresh) a node. */
  addNode(node) {
    if (!node || !node.id) return this;
    this._nodes.set(node.id, node);
    if (!this._adj.has(node.id)) this._adj.set(node.id, new Set());
    return this;
  }

  /** Add many nodes and optionally connect each new node to the others (a fresh cohort). */
  addCohort(nodes, { interconnect = false, initialWeight = 0.1 } = {}) {
    const list = Array.isArray(nodes) ? nodes : [];
    for (const n of list) this.addNode(n);
    if (interconnect) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          this.connect(list[i].id, list[j].id, initialWeight);
        }
      }
    }
    return this;
  }

  /** Create or set an undirected edge weight between two nodes. */
  connect(id1, id2, weight = 0.1) {
    if (id1 === id2 || !this._nodes.has(id1) || !this._nodes.has(id2)) return this;
    this._edges.set(key(id1, id2), clamp01(weight));
    this._adj.get(id1).add(id2);
    this._adj.get(id2).add(id1);
    this._enforceDegree(id1);
    this._enforceDegree(id2);
    return this;
  }

  /** Current weight of the A↔B link (0 if none). */
  weight(id1, id2) {
    return this._edges.get(key(id1, id2)) ?? 0;
  }

  /** Neighbors of a node with their weights, strongest-first. */
  neighbors(id) {
    const set = this._adj.get(id);
    if (!set) return [];
    return [...set]
      .map((nid) => ({ id: nid, weight: this.weight(id, nid) }))
      .sort((a, b) => b.weight - a.weight);
  }

  /**
   * Hebbian reinforcement: nodes that succeeded together strengthen their link.
   * w ← w + η·(1−w)  (saturating toward 1). Creates the edge if absent.
   */
  reinforce(id1, id2, gain = 1) {
    if (id1 === id2 || !this._nodes.has(id1) || !this._nodes.has(id2)) return this;
    const w = this.weight(id1, id2);
    const next = clamp01(w + this.eta * gain * (1 - w));
    this.connect(id1, id2, next);
    return this;
  }

  /**
   * Reinforce every pair in a co-active set (e.g. the verdict-nodes that all ranked a
   * winner highly). This is how the mesh learns which perspectives corroborate each other.
   */
  reinforceGroup(ids, gain = 1) {
    const arr = [...new Set(ids)].filter((id) => this._nodes.has(id));
    for (let i = 0; i < arr.length; i++)
      for (let j = i + 1; j < arr.length; j++)
        this.reinforce(arr[i], arr[j], gain);
    return this;
  }

  /** Global forgetting: every edge weight decays one step (w ← w·(1−δ)). */
  decay() {
    for (const [k, w] of this._edges) this._edges.set(k, w * (1 - this.delta));
    return this;
  }

  /** Remove links that have withered below the prune threshold. Returns #removed. */
  prune() {
    let removed = 0;
    // Map iterators tolerate deletion of the current entry, so we can prune in-place
    // without materializing a copy of every edge first (this runs every mesh tick).
    for (const [k, w] of this._edges) {
      if (w < this.theta) {
        const sep = k.indexOf('|');
        const a = k.slice(0, sep), b = k.slice(sep + 1);
        this._edges.delete(k);
        this._adj.get(a)?.delete(b);
        this._adj.get(b)?.delete(a);
        removed++;
      }
    }
    return removed;
  }

  /** One maintenance tick: decay, then prune. Call between cognitive cycles. */
  tick() {
    this.decay();
    const pruned = this.prune();
    return { pruned, nodes: this._nodes.size, edges: this._edges.size };
  }

  /** Cap a node's degree by dropping its weakest edges when over maxDegree. */
  _enforceDegree(id) {
    if (!Number.isFinite(this.maxDegree)) return;
    const set = this._adj.get(id);
    if (!set || set.size <= this.maxDegree) return;
    const ranked = [...set].map((nid) => ({ nid, w: this.weight(id, nid) })).sort((a, b) => a.w - b.w);
    const drop = ranked.slice(0, set.size - this.maxDegree);
    for (const { nid } of drop) {
      this._edges.delete(key(id, nid));
      set.delete(nid);
      this._adj.get(nid)?.delete(id);
    }
  }

  /** A serializable snapshot of the current mesh (for logging / persistence / UI). */
  snapshot() {
    return {
      nodes: [...this._nodes.keys()],
      edges: [...this._edges].map(([k, w]) => {
        const [a, b] = k.split('|');
        return { a, b, weight: Math.round(w * 1000) / 1000 };
      }),
    };
  }

  get size() { return this._nodes.size; }
  get edgeCount() { return this._edges.size; }
}

function key(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

export { clamp01 as _clamp01 };
