// lib/sourceUniforms.wesl — per-source 5-bit pick-ID uniform for the
// points pipeline.
//
// Carries this draw's 5-bit Source enum value (Synthetic=0, SDSS=1,
// TwoMRS=2, Glade=3, Famous=4). The points vertex stage reads
// 'source.sourceCode' and composes each instance's packed identity as
// '(sourceCode << 27u) | instance_index' for the selection-halo +
// pick-output paths.
//
// ## Why separated from FadeUniforms
//
// Two uniforms with different update cadences:
//   - fade.opacity:   written every frame, every consumer.
//   - source.sourceCode: written once at upload, points only.
//
// Co-locating them in one 16-byte uniform would force every per-frame
// fade write to read-modify-write the sourceCode bytes (or use a
// 4-byte-offset writeBuffer, coupling the layouts), and would give
// every non-points renderer (volumes, filaments, labels, overlays) a
// sourceCode slot they never read. Separating keeps each renderer
// paying only for the uniforms it actually needs.
//
// ## Why @group(2)
//
// @group(0) is the per-frame uniform (viewProj, viewport, …).
// @group(1) is FadeUniforms (universal).
// @group(2) is points-only — SourceUniforms.
//
// Non-points pipelines don't declare @group(2); their pipeline layouts
// list only @group(0) and @group(1).

struct SourceUniforms {
  // 5-bit Source enum value (Synthetic=0, SDSS=1, TwoMRS=2, Glade=3,
  // Famous=4). Stored as u32 because WGSL uniforms have no smaller
  // integer types and the pack-into-pickbuffer uses u32 arithmetic
  // anyway.
  sourceCode: u32,

  // Per-survey K-correction coefficient (ramp-position units per unit
  // redshift z). Read by the points vertex stage as
  // 'colorIndex - kPerZ * z' to convert observed colour to rest-frame.
  // Values live in 'data/colourIndex.ts' SPEC table and never change
  // for a given survey, so this stays a one-shot upload-time write.
  // Other consumers of SourceUniforms (cluster markers, etc.) leave
  // this slot zero — their shaders don't read kPerZ.
  kPerZ: f32,

  // Pad to 16-byte WebGPU-minimum uniform-buffer alignment. Each pad
  // is a free 4-byte slot for a future field (sourceCode and kPerZ
  // already claimed the first two).
  _pad1: u32,
  _pad2: u32,
};
