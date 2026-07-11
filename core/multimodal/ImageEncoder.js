// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/multimodal/ImageEncoder.js — turn images into vectors, in the SAME space as text.
//
// Multimodality in CogMesh reuses the retrieval machinery: if an image can be embedded into
// the same vector space as text, then SemanticRetriever, memory recall, and the cognitive
// mesh all work over images with zero new search logic. That shared space is exactly what a
// CLIP-style model provides (image and its caption land near each other).
//
//     image ─▶ [CLIP image encoder] ─▶ vector ┐
//     text  ─▶ [CLIP text  encoder] ─▶ vector ┘  same space → cosine compares across modalities
//
// Primary backend: a CLIP-style ONNX model run locally via onnxruntime-node (no vision API).
// Fallback: a dependency-free deterministic feature embedding computed from raw pixel stats
// (color histogram + coarse spatial grid). The fallback is honestly limited — it captures
// low-level appearance, NOT semantics ("is this a dog?") — but it keeps the pipeline runnable
// and testable without a model, and it shares the { embed, dim, kind } interface so callers
// don't branch on backend.
//
// Input is a decoded image: { width, height, data: Uint8ClampedArray(RGBA) } — the shape a
// browser <canvas> or `sharp`/`jimp` produces. The core does not decode files itself (that
// pulls heavy deps); the host provides decoded pixels.

const l2normalize = (vec) => {
  let n = 0;
  for (let i = 0; i < vec.length; i++) n += vec[i] * vec[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] /= n;
  return vec;
};

/**
 * Dependency-free image feature embedding: a color histogram over a coarse spatial grid.
 * Deterministic and fast; captures dominant colors and their rough layout. NOT semantic —
 * two photos of different dogs may be far apart while a dog and a brown couch may be close.
 * It's the floor that keeps multimodal retrieval runnable without a model.
 */
export class PixelFeatureEncoder {
  /**
   * @param {{ grid?:number, bins?:number }} [opts]
   *   grid: spatial cells per axis (grid×grid regions). bins: color bins per channel.
   */
  constructor({ grid = 4, bins = 4 } = {}) {
    this.grid = grid;
    this.bins = bins;
    // dim = grid² regions × bins³ color buckets
    this.dim = grid * grid * bins * bins * bins;
    this.kind = 'pixel-features';
  }

  _vector(image) {
    const { width, height, data } = image || {};
    const vec = new Float32Array(this.dim);
    if (!width || !height || !data) return vec;
    const { grid, bins } = this;
    const cellW = width / grid, cellH = height / grid;
    const binsq = bins * bins * bins;

    for (let y = 0; y < height; y++) {
      const gy = Math.min(grid - 1, Math.floor(y / cellH));
      for (let x = 0; x < width; x++) {
        const gx = Math.min(grid - 1, Math.floor(x / cellW));
        const idx = (y * width + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const rb = Math.min(bins - 1, (r * bins) >> 8);
        const gb = Math.min(bins - 1, (g * bins) >> 8);
        const bb = Math.min(bins - 1, (b * bins) >> 8);
        const region = gy * grid + gx;
        const color = (rb * bins + gb) * bins + bb;
        vec[region * binsq + color] += 1;
      }
    }
    return l2normalize(vec);
  }

  async embed(image) { return this._vector(image); }
  async embedBatch(images) { return (images || []).map((im) => this._vector(im)); }
}

/**
 * CLIP-style image encoder via onnxruntime-node. Lazily loads the runtime so importing this
 * module is cheap. Expects a preprocessed float tensor (the host resizes/normalizes to the
 * model's expected input, e.g. 224×224×3) — preprocessing specifics vary per CLIP export, so
 * the caller supplies a `preprocess(image) → Float32Array` matching their model.
 */
export class ClipImageEncoder {
  /**
   * @param {{ modelPath:string, dim?:number, inputName?:string, outputName?:string,
   *           inputShape?:number[], preprocess:Function }} opts
   */
  constructor(opts = {}) {
    if (!opts.modelPath) throw new Error('[ClipImageEncoder] modelPath is required');
    if (typeof opts.preprocess !== 'function') throw new Error('[ClipImageEncoder] preprocess(image) is required');
    this.modelPath = opts.modelPath;
    this.dim = opts.dim || 512;                 // CLIP ViT-B/32 → 512
    this.inputName = opts.inputName || 'pixel_values';
    this.outputName = opts.outputName || 'image_embeds';
    this.inputShape = opts.inputShape || [1, 3, 224, 224];
    this.preprocess = opts.preprocess;
    this.kind = 'clip-onnx';
    this._session = null;
  }

  async init() {
    if (this._session) return this;
    const ort = await import('onnxruntime-node'); // optional dep
    this._session = await ort.InferenceSession.create(this.modelPath);
    this._ort = ort;
    return this;
  }

  async embed(image) { return (await this.embedBatch([image]))[0]; }

  async embedBatch(images) {
    if (!this._session) await this.init();
    const out = [];
    for (const image of (images || [])) {
      const pixels = this.preprocess(image); // Float32Array in the model's layout
      const feeds = { [this.inputName]: new this._ort.Tensor('float32', pixels, this.inputShape) };
      const result = await this._session.run(feeds);
      const emb = Float32Array.from(result[this.outputName].data);
      out.push(l2normalize(emb));
    }
    return out;
  }
}

/**
 * Build the best available image encoder. Tries CLIP ONNX when configured; on any failure
 * falls back to pixel features so multimodal retrieval always runs.
 * @param {{ modelPath?:string, preprocess?:Function, dim?:number,
 *           grid?:number, bins?:number }} [opts]
 * @returns {Promise<{ encoder:object, kind:string, fellBack:boolean, reason?:string }>}
 */
export async function createImageEncoder(opts = {}) {
  if (opts.modelPath && typeof opts.preprocess === 'function') {
    try {
      const enc = new ClipImageEncoder(opts);
      await enc.init();
      return { encoder: enc, kind: enc.kind, fellBack: false };
    } catch (err) {
      const encoder = new PixelFeatureEncoder(opts);
      return { encoder, kind: encoder.kind, fellBack: true, reason: String(err && err.message || err) };
    }
  }
  const encoder = new PixelFeatureEncoder(opts);
  return { encoder, kind: encoder.kind, fellBack: false };
}

export { l2normalize as _l2normalize };
