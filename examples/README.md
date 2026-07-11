# CogMesh Examples 🔌

Three ways to give CogMesh a "brain." The **cognition layer stays the same** — only
what runs inside `engine.run()` changes. Mix and match freely.

| File | Connects to | Needs |
|------|-------------|-------|
| [`ollama.mjs`](./ollama.mjs) | 🦙 Open-source LLM (Ollama) | Ollama running locally |
| [`api.mjs`](./api.mjs) | ☁️ Commercial API (OpenAI-compatible) | an API key |
| *(below)* | 🎓 Your own trained model | the PAD encoder from `training/` |

## Running the examples

Just run them with plain Node — no flags, no loader needed:

```bash
node examples/ollama.mjs "Explain gradient descent"
```

> Imports in `core/` include explicit `.js` extensions, so the examples run directly
> under Node ESM **and** inside any bundler (Vite / webpack / Next.js) with zero setup.
> *(An optional `loader.mjs` resolver is kept for backward compatibility, but you no
> longer need it.)*

### 🦙 1. Open-source LLM (Ollama) — local, free, private

```bash
# one-time setup
#   1) install Ollama:  https://ollama.com
#   2) pull a model:    ollama pull llama3
node examples/ollama.mjs "Give me one focus tip"
```

### ☁️ 2. Commercial API — OpenAI-compatible

```bash
export LLM_API_KEY="sk-..."
export LLM_BASE_URL="https://api.openai.com/v1"   # or Groq, Together, vLLM, ...
export LLM_MODEL="gpt-4o-mini"
node examples/api.mjs "Summarize the CAP theorem"
```

### 🎓 3. Your own trained model — the PAD encoder

Serve your trained encoder, then feed real (learned) emotion coordinates into the
cognition core:

```bash
python training/scripts/serve.py            # → http://localhost:8100/encode
```

```js
import { PADState } from '../core/pad/index.js';
const padState = new PADState();

const { p, a, d } = await (await fetch('http://localhost:8100/encode', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: userMessage }),
})).json();

padState.update({ p, a, d });               // trained cognition, not rule-based!
console.log(padState.getCurrentEmotion().emotion.label.en);
```

### 🧠 4. The Brain-like Parallel Cognitive Mesh — no LLM required

The full self-revising cycle described in the design doc, running entirely locally on
the World Model as its "imagination":

```bash
node examples/cognitive-mesh.mjs
node examples/cognitive-mesh.mjs "grow the portfolio without taking on risk"
```

It runs **generate → decompose → parallel simulation → evaluation council (debate)
→ conflict → synthesis → regeneration → self-improvement**, prints what it considered
each cycle, and shows which thought-perspectives wired together in the adaptive mesh —
all while never touching reality (it only imagines futures). See
[`core/cognition/`](../core/cognition/) for the stages, and run the tests with
`npm run test:cognition`.

### ⚡ 5. True multi-core parallelism benchmark

Measure real worker-thread speedup for world rollouts on **your** machine:

```bash
node examples/worker-benchmark.mjs
```

It runs the same workload sequentially and across a worker pool, printing the speedup
at increasing sizes. On a multi-core box you'll see a real 🚀 at higher N; on a single
core (or tiny workloads) parallel is slower — which is exactly why `simulateParallel()`
auto-falls-back to in-thread execution below ~256 nodes. Workers rebuild the simulator
from data only, so custom-function simulators safely stay single-threaded.

## The key idea

Every example registers engines on an `EngineRegistry` and lets a `MeshRouter`
orchestrate them. The router adds **metacognition**, **self-correction**, and a
**compute budget** around whatever brain you plugged in — so you get explainable,
self-regulating behavior on top of any model.

> Start local with Ollama today, add a commercial API tomorrow, drop in your own
> model whenever you're ready. **No core changes required.**
