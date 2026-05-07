// toneMap/io.wesl — shared structs for the tone-map post-process pass.
//
// This is the smallest of the per-renderer io modules: the tone-map
// pass has no per-vertex inputs (the vertex stage synthesises clip
// positions from 'vertex_index' alone) and the only struct shared
// across stages is the vertex-to-fragment 'VSOut' carrying the UV.
// 'ToneMapUniforms' is fragment-only — only the fragment reads
// exposure / whitepoint / curve — but we keep it here in io.wesl to
// match the convention used by every other split shader: structs
// live in io, bindings live in the consuming files.
//
// ## Why a separate io module
//
// Originally everything lived in a single 'toneMap.wesl'. Splitting
// it into io + vertex + fragment mirrors the points/ and milkyWay/
// splits (tasks 13 and 14) so each stage compiles a strictly-
// smaller shader module from disjoint source. There's almost no
// shared surface here — VSOut is the only struct touching both
// stages — but uniformity across renderers is worth the tiny extra
// file.
//
// ## Why bindings live in fragment.wesl, not here
//
// WESL has no global state — '@group(N) @binding(M) var<uniform> X'
// is module-local and cannot be exported across modules. The
// fragment file redeclares its texture / sampler / uniform bindings
// directly, importing 'ToneMapUniforms' from this single
// authoritative place so the layout numbers cannot drift.

// ── Tone-map uniform layout ─────────────────────────────────────────
//
// Five-curve post-process: exposure scales the HDR input, whitepoint²
// is pre-squared CPU-side for the Reinhard-extended formula,
// asinhSoftness controls the asinh stretch's linear→log knee, and
// curve selects between Linear / Reinhard / Asinh / Gamma2 / ACES.
// 16 bytes total, naturally 16-byte aligned — the smallest possible
// uniform buffer for this pass.

struct ToneMapUniforms {
  exposure: f32,
  // whitepoint² (pre-squared CPU-side) for Reinhard-extended.
  whitepointSq: f32,
  // softening constant for asinh stretch — controls where the curve
  // transitions from linear to logarithmic.  Default 10.
  asinhSoftness: f32,
  // 0..4 — see the toneMap/fragment.wesl header for the curve→value
  // mapping.
  curve: u32,
}

// ── vertex-to-fragment interface ────────────────────────────────────
//
// The 'covering triangle' trick used by vs() emits clip-space
// positions that span [-1, 1]² and matching UVs in [0, 1]² for the
// fragment stage to sample the HDR texture with.

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
}
