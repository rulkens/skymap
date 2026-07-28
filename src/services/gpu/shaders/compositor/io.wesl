// compositor/io.wesl — shared structs for the unified compositor pass.
//
// The compositor is the single 'merge one offscreen texture into a
// target' primitive: every historical variant (HDR tone-map into the
// swap chain, straight-alpha foreground OVER the swap chain, additive
// volume-into-HDR) is one draw through this pass with a different
// blend mode and optional tone-map. It has no per-vertex inputs — the
// vertex stage synthesises clip positions from 'vertex_index' alone —
// so the only cross-stage struct is 'VSOut' carrying the UV.
//
// ## Why a separate io module
//
// Mirrors the toneMap/, points/, and milkyWay/ splits: io holds the
// structs, vertex and fragment hold their own bindings. Each stage
// then compiles a strictly-smaller shader module from disjoint source.
//
// ## Why bindings live in fragment.wesl, not here
//
// WESL has no global state — '@group(N) @binding(M) var<uniform> X'
// is module-local and cannot be exported across modules. The fragment
// file redeclares its texture / sampler / uniform bindings directly,
// importing 'CompositorUniforms' from this single authoritative place
// so the layout numbers cannot drift.

// ── Compositor uniform layout ───────────────────────────────────────
//
// 32-byte buffer, every lane in use. exposure scales the HDR input,
// whitepoint² is pre-squared CPU-side for Reinhard-extended,
// asinhSoftness controls the asinh stretch's linear→log knee, curve
// selects between Linear / Reinhard / Asinh / Gamma2 / ACES,
// toneEnabled gates the whole tone-map chain (0 = raw pass-through for
// LDR / additive sources), and preserveAlpha decides whether the
// output carries the source's coverage or a forced opaque 1.0. The
// two alpha-related flags are separate u32s because they answer two
// independent questions — 'do we tone-map at all' and 'is this a
// coverage-bearing layer' — and folding them would re-braid them.
// hdrKnee / hdrHeadroom are the extended-range headroom knobs (see their
// doc comments below); both are 0 in every SDR draw.
//
// | offset | field         | type |
// | ------ | ------------- | ---- |
// | 0      | exposure      | f32  |
// | 4      | whitepointSq  | f32  |
// | 8      | asinhSoftness | f32  |
// | 12     | curve         | u32  |
// | 16     | toneEnabled   | u32  |
// | 20     | preserveAlpha | u32  |
// | 24     | hdrKnee       | f32  |
// | 28     | hdrHeadroom   | f32  |

struct CompositorUniforms {
  exposure: f32,
  // whitepoint² (pre-squared CPU-side) for Reinhard-extended.
  whitepointSq: f32,
  // softening constant for asinh stretch — controls where the curve
  // transitions from linear to logarithmic.  Default 10.
  asinhSoftness: f32,
  // 0..4 — see the compositor/fragment.wesl header for the curve→value
  // mapping.
  curve: u32,
  // 1 = run the tone-map chain; 0 = raw pass-through (LDR / additive).
  toneEnabled: u32,
  // 1 = emit the source's straight-alpha coverage; 0 = force opaque 1.0.
  preserveAlpha: u32,
  // Bytes 24, 28: the post-exposure knee above which over-white energy spills
  // into an extended-range swap chain, and the multiplier on that spill. Both 0
  // in SDR, where the output is exactly the tone curve's clamped result.
  hdrKnee: f32,
  hdrHeadroom: f32,
}

// ── vertex-to-fragment interface ────────────────────────────────────
//
// The 'covering triangle' trick used by vs() emits clip-space
// positions that span [-1, 1]² and matching UVs in [0, 1]² for the
// fragment stage to sample the source texture with.

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
}
