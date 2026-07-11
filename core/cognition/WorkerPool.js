// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/cognition/WorkerPool.js — real OS-thread parallelism for world rollouts.
//
// The cognitive loop simulates many independent futures; on a multi-core box those can run
// on separate threads. This pool spins up N reusable workers ONCE (worker creation costs
// ~ms, far more than one 50μs rollout, so we never create-per-task) and streams batches of
// actions to whichever worker is free.
//
//   main thread                    worker 0 ─ rollout, rollout, …
//     dispatch(batch) ─────────┬─→ worker 1 ─ rollout, …
//                              └─→ worker 2 ─ …
//     ← {score, future}[] ────────┘  (results reassembled in order)
//
// HARD LIMITS (stated honestly, enforced in code):
//   • Workers rebuild the simulator from DATA ONLY (field snapshot + goalWeights). A
//     simulator with a custom applyFn/scoreFn can't be sent across threads, so the pool
//     refuses it (canParallelize=false) and the caller falls back to main-thread execution.
//   • Parallelism only pays off above a work threshold; below it, thread hand-off costs
//     more than it saves. ParallelWorldSimulation checks the node count before using this.
//
// This module is optional and lazy: nothing imports worker_threads until you actually
// construct a WorkerPool, so the rest of CogMesh stays dependency-light and browser-safe.

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(HERE, 'rolloutWorker.mjs');

/**
 * Decide whether a simulator can run on worker threads. It can iff it uses the default
 * apply/score (i.e. it was built from goalWeights, not custom functions). We detect this
 * by checking for a serializable descriptor the caller attached, or a plain world snapshot
 * plus goalWeights. Custom-function simulators return false → caller stays single-threaded.
 */
export function describeSimulator(sim) {
  // unwrap a RolloutCache if present
  const target = sim && sim.simulator && typeof sim.simulator.rollout === 'function' ? sim.simulator : sim;
  const world = target && target.world;
  if (!world || typeof world.getFieldSnapshot !== 'function') return null;
  // goalWeights are captured on the simulator when built the default way
  const goalWeights = target._goalWeights || target.goalWeights;
  if (!goalWeights) return null; // custom scoreFn → not describable → no parallel
  return { world: world.getFieldSnapshot(), goalWeights };
}

export class WorkerPool {
  /**
   * @param {object} descriptor  { world:{fields}, goalWeights } from describeSimulator()
   * @param {{ size?:number }} [opts]  worker count (default: CPU count − 1, min 1)
   */
  constructor(descriptor, opts = {}) {
    if (!descriptor || !descriptor.goalWeights) {
      throw new Error('[WorkerPool] a data-only simulator descriptor is required');
    }
    this.descriptor = descriptor;
    this.size = Math.max(1, opts.size || Math.max(1, (os.cpus()?.length || 2) - 1));
    this._workers = [];
    this._free = [];
    this._queue = [];
    this._seq = 0;
    this._pending = new Map();
    this._started = false;
  }

  /** Lazily start all workers and wait until each signals ready. */
  async start() {
    if (this._started) return;
    this._started = true;
    await Promise.all(Array.from({ length: this.size }, () => this._spawn()));
  }

  _spawn() {
    return new Promise((resolve) => {
      const worker = new Worker(WORKER_PATH, { workerData: this.descriptor });
      worker.on('message', (msg) => {
        if (msg.type === 'ready') {
          if (!this._workers.includes(worker)) {
            this._workers.push(worker);
            this._free.push(worker);
            resolve();
          }
          return;
        }
        this._onResult(worker, msg);
      });
      worker.on('error', (err) => {
        const pend = worker.__job && this._pending.get(worker.__job);
        if (pend) { pend.reject(err); this._pending.delete(worker.__job); }
        this._release(worker);
      });
    });
  }

  _onResult(worker, msg) {
    const pend = this._pending.get(msg.id);
    if (pend) {
      this._pending.delete(msg.id);
      if (msg.type === 'error') pend.reject(new Error(msg.error));
      else pend.resolve(msg.results);
    }
    this._release(worker);
  }

  _release(worker) {
    worker.__job = null;
    this._free.push(worker);
    this._drain();
  }

  _drain() {
    while (this._free.length && this._queue.length) {
      const worker = this._free.pop();
      const job = this._queue.shift();
      worker.__job = job.id;
      this._pending.set(job.id, job);
      worker.postMessage({ type: 'rollout', id: job.id, actions: job.actions, steps: job.steps });
    }
  }

  /** Submit one batch of actions; resolves to [{score, future}] in the same order. */
  _submit(actions, steps) {
    return new Promise((resolve, reject) => {
      const id = ++this._seq;
      this._queue.push({ id, actions, steps, resolve, reject });
      this._drain();
    });
  }

  /**
   * Run rollouts for many actions across all workers, splitting into `size` chunks so each
   * worker gets a contiguous slice. Returns results aligned to the input order.
   * @param {Array} actions
   * @param {{ steps?: number }} [opts]
   */
  async map(actions, opts = {}) {
    if (!this._started) await this.start();
    const steps = Number.isFinite(opts.steps) ? opts.steps : 1;
    const list = Array.isArray(actions) ? actions : [];
    if (list.length === 0) return [];

    // chunk into `size` roughly-equal contiguous slices → one batch per worker
    const chunks = [];
    const per = Math.ceil(list.length / this.size);
    for (let i = 0; i < list.length; i += per) chunks.push(list.slice(i, i + per));

    const chunkResults = await Promise.all(chunks.map((c) => this._submit(c, steps)));
    return chunkResults.flat();
  }

  /** Terminate all workers and free the threads. Always call when done. */
  async destroy() {
    await Promise.all(this._workers.map((w) => w.terminate()));
    this._workers = []; this._free = []; this._queue = []; this._pending.clear();
    this._started = false;
  }
}
