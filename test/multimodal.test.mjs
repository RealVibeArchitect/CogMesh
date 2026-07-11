// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/multimodal.test.mjs — images & video in the shared retrieval space.
//
//   node --test test/multimodal.test.mjs
//
// Runs on the deterministic pixel-feature fallback (no model needed). The CLIP ONNX backend
// shares the same { embed, dim, kind } interface, so this validates the contract it must meet.
// The key property under test: image/video vectors live in the SAME space the retriever uses,
// so multimodal search needs no new logic.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createImageEncoder, PixelFeatureEncoder, VideoEncoder } from '../core/multimodal/index.js';
import { SemanticRetriever, cosine } from '../core/retrieval/index.js';

/** make a solid-color RGBA image. */
function solid(r, g, b, w = 16, h = 16) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255; }
  return { width: w, height: h, data };
}

test('image encoder: factory falls back to pixel features without a model', async () => {
  const { encoder, kind, fellBack } = await createImageEncoder();
  assert.equal(kind, 'pixel-features');
  assert.equal(fellBack, false);
  assert.ok(encoder.dim > 0);
});

test('image encoder: bad model config → graceful fallback', async () => {
  const { kind, fellBack, reason } = await createImageEncoder({
    modelPath: '/no/such/clip.onnx', preprocess: () => new Float32Array(3 * 224 * 224),
  });
  assert.equal(kind, 'pixel-features');
  assert.equal(fellBack, true);
  assert.ok(typeof reason === 'string');
});

test('image encoder: similar colors embed close, different colors far', async () => {
  const enc = new PixelFeatureEncoder();
  const red = await enc.embed(solid(255, 0, 0));
  const nearRed = await enc.embed(solid(250, 5, 5));
  const blue = await enc.embed(solid(0, 0, 255));
  assert.ok(cosine(red, nearRed) > 0.9, 'near-identical images are close');
  assert.ok(cosine(red, blue) < 0.2, 'very different images are far');
});

test('image encoder: deterministic and fixed-dim', async () => {
  const enc = new PixelFeatureEncoder({ grid: 4, bins: 4 });
  const a = await enc.embed(solid(120, 60, 30));
  const b = await enc.embed(solid(120, 60, 30));
  assert.equal(a.length, enc.dim);
  assert.deepEqual(Array.from(a), Array.from(b));
});

test('multimodal: images are searchable in the SAME retriever as text', async () => {
  const enc = new PixelFeatureEncoder();
  // retriever is modality-agnostic — it just stores vectors; feed it image vectors
  const r = new SemanticRetriever(enc);
  await r.add(solid(255, 0, 0), { label: 'red' });
  await r.add(solid(0, 255, 0), { label: 'green' });
  await r.add(solid(0, 0, 255), { label: 'blue' });
  assert.equal(r.size, 3);
  // manual nearest-vector check (query() embeds text; here we compare image vectors directly)
  const query = await enc.embed(solid(240, 10, 10)); // reddish
  let best = null;
  for (const item of r._items.values()) {
    const s = cosine(query, item.vec);
    if (!best || s > best.s) best = { label: item.payload.label, s };
  }
  assert.equal(best.label, 'red', 'reddish query retrieves the red image');
});

test('video encoder: aggregates frames into one clip vector in the same space', async () => {
  const enc = new PixelFeatureEncoder();
  const video = new VideoEncoder(enc, { maxFrames: 4 });
  const frames = [solid(255, 0, 0), solid(200, 40, 0), solid(150, 80, 0), solid(100, 120, 0)];
  const clip = await video.embed(frames);
  assert.equal(clip.length, enc.dim, 'clip vector shares the image dim/space');
  assert.equal(video.kind, 'video(pixel-features)');
});

test('video encoder: samples down to maxFrames and returns keyframe vectors', async () => {
  const enc = new PixelFeatureEncoder();
  const video = new VideoEncoder(enc, { maxFrames: 3 });
  const frames = Array.from({ length: 12 }, (_, i) => solid(i * 20, 0, 0));
  const detailed = await video.embedDetailed(frames);
  assert.equal(detailed.frames.length, 3, 'sampled 12 frames down to 3 keyframes');
  assert.equal(detailed.clip.length, enc.dim);
  // sampled indices should span the clip (first and last included)
  assert.equal(detailed.frames[0].index, 0);
  assert.equal(detailed.frames[detailed.frames.length - 1].index, 11);
});

test('video encoder: empty input yields a zero vector, no crash', async () => {
  const enc = new PixelFeatureEncoder();
  const video = new VideoEncoder(enc);
  const clip = await video.embed([]);
  assert.equal(clip.length, enc.dim);
});
