// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/multimodal/VideoEncoder.js — a video is a sequence of frames.
//
// Rather than a bespoke video model, CogMesh treats a video as sampled keyframes, embeds
// each with the image encoder (into the shared text/image space), and aggregates the frame
// vectors into one clip embedding. This keeps video in the SAME vector space as text and
// images, so one SemanticRetriever searches across all three modalities.
//
//     video ─▶ sample keyframes ─▶ [ImageEncoder]×N ─▶ aggregate ─▶ clip vector
//
// Aggregation strategies:
//   'mean'    average the frame vectors (a gist of the whole clip) — default
//   'keyframe' keep per-frame vectors too (for temporal / "when does X appear?" queries)
//
// The host supplies decoded frames (an array of { width, height, data } images) — the core
// doesn't demux video (that needs ffmpeg-class deps). Sampling here just picks which of the
// provided frames to embed, so it works on any decoded frame array.

const l2normalize = (vec) => {
  let n = 0;
  for (let i = 0; i < vec.length; i++) n += vec[i] * vec[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] /= n;
  return vec;
};

export class VideoEncoder {
  /**
   * @param {object} imageEncoder  an ImageEncoder ({ embed/embedBatch, dim, kind })
   * @param {{ maxFrames?:number, strategy?:'mean'|'keyframe' }} [opts]
   *   maxFrames: cap on frames to embed (evenly sampled across the clip). Default 8.
   *   strategy:  how to aggregate frame vectors (default 'mean').
   */
  constructor(imageEncoder, opts = {}) {
    if (!imageEncoder || typeof imageEncoder.embedBatch !== 'function') {
      throw new Error('[VideoEncoder] an ImageEncoder is required');
    }
    this.image = imageEncoder;
    this.dim = imageEncoder.dim;
    this.kind = `video(${imageEncoder.kind})`;
    this.maxFrames = Number.isFinite(opts.maxFrames) ? Math.max(1, opts.maxFrames) : 8;
    this.strategy = opts.strategy === 'keyframe' ? 'keyframe' : 'mean';
  }

  /** Evenly sample up to maxFrames indices across the frame array. */
  _sample(frames) {
    const n = frames.length;
    if (n <= this.maxFrames) return frames.map((f, i) => ({ frame: f, index: i }));
    const out = [];
    for (let k = 0; k < this.maxFrames; k++) {
      const i = Math.floor((k * (n - 1)) / (this.maxFrames - 1));
      out.push({ frame: frames[i], index: i });
    }
    return out;
  }

  /**
   * Embed a video (array of decoded frames) into one clip vector.
   * @param {Array<{width,height,data}>} frames
   * @returns {Promise<Float32Array>} the aggregated clip embedding
   */
  async embed(frames) {
    const list = Array.isArray(frames) ? frames : [];
    if (list.length === 0) return new Float32Array(this.dim);
    const sampled = this._sample(list);
    const vecs = await this.image.embedBatch(sampled.map((s) => s.frame));
    return this._aggregate(vecs);
  }

  /**
   * Embed a video AND return the per-keyframe vectors (for temporal queries).
   * @param {Array} frames
   * @returns {Promise<{ clip:Float32Array, frames:Array<{index:number, vec:Float32Array}> }>}
   */
  async embedDetailed(frames) {
    const list = Array.isArray(frames) ? frames : [];
    if (list.length === 0) return { clip: new Float32Array(this.dim), frames: [] };
    const sampled = this._sample(list);
    const vecs = await this.image.embedBatch(sampled.map((s) => s.frame));
    return {
      clip: this._aggregate(vecs),
      frames: sampled.map((s, i) => ({ index: s.index, vec: vecs[i] })),
    };
  }

  _aggregate(vecs) {
    if (vecs.length === 0) return new Float32Array(this.dim);
    const out = new Float32Array(this.dim);
    for (const v of vecs) for (let i = 0; i < this.dim && i < v.length; i++) out[i] += v[i];
    for (let i = 0; i < out.length; i++) out[i] /= vecs.length;
    return l2normalize(out);
  }
}
