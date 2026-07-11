// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/cognition/rolloutWorker.mjs — the worker-thread side of parallel simulation.
//
// Runs on a separate OS thread. It rebuilds a WorldSimulator locally from *data only*
// (a field snapshot + goalWeights) — because functions (custom applyFn/scoreFn) and live
// object graphs can't cross the thread boundary. The main thread guarantees it only
// dispatches here when the simulator is data-describable (see WorkerPool.canParallelize);
// anything with custom functions runs on the main thread instead.
//
// Protocol (main → worker):
//   { type: 'init', world: {fields}, goalWeights }   → set up the local simulator once
//   { type: 'rollout', id, actions: [...], steps }   → simulate a batch, reply with scores
// Protocol (worker → main):
//   { type: 'ready' }
//   { type: 'result', id, results: [{score, future}] }

import { parentPort, workerData } from 'node:worker_threads';
import { WorldModel } from '../world/WorldModel.js';
import { WorldSimulator } from '../world/WorldSimulator.js';

let simulator = null;

/** Build a fresh WorldSimulator from plain data (no functions crossed the boundary). */
function buildSimulator({ world, goalWeights }) {
  const model = new WorldModel();
  for (const [k, v] of Object.entries(world || {})) model.setField(k, v);
  return new WorldSimulator(model, { goalWeights: goalWeights || {} });
}

// If workerData carried an init payload, set up immediately (saves a round-trip).
if (workerData && workerData.world) {
  simulator = buildSimulator(workerData);
}

parentPort.on('message', (msg) => {
  try {
    if (msg.type === 'init') {
      simulator = buildSimulator(msg);
      parentPort.postMessage({ type: 'ready' });
      return;
    }
    if (msg.type === 'rollout') {
      if (!simulator) throw new Error('worker not initialized');
      const steps = Number.isFinite(msg.steps) ? msg.steps : 1;
      const results = msg.actions.map((action) => {
        const r = simulator.rollout(action, { steps });
        return { score: r.score, future: r.future };
      });
      parentPort.postMessage({ type: 'result', id: msg.id, results });
      return;
    }
  } catch (err) {
    parentPort.postMessage({ type: 'error', id: msg.id, error: String(err && err.message || err) });
  }
});

// signal we're up (covers the workerData-init path)
parentPort.postMessage({ type: 'ready' });
