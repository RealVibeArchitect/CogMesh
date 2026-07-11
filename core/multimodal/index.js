// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/multimodal/index.js — images & video in the shared retrieval vector space.
//
//   - ImageEncoder    CLIP-style ONNX (local) with a deterministic pixel-feature fallback
//   - VideoEncoder    keyframe sampling + aggregation over the image encoder
//
// Because these produce vectors in the SAME space as text embeddings, the existing
// SemanticRetriever searches text, images, and video with no new logic — that's the whole
// point of routing multimodality through a shared embedding space.

export {
  PixelFeatureEncoder,
  ClipImageEncoder,
  createImageEncoder,
} from './ImageEncoder.js';
export { VideoEncoder } from './VideoEncoder.js';
