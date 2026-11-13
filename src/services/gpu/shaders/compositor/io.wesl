// compositor/io.wesl — the compositor's shared structs, and the byte-layout
// contract for its uniform buffer: 'compositor.ts' packs 'CompositorUniforms'
// lane by lane against the table below, so this file runs over the comment
// budget on purpose. Bindings live in fragment.wesl (WESL cannot export a
// '@group @binding' var across modules); this struct is the one definition.

// ── Compositor uniform layout ───────────────────────────────────────
//
// 80-byte buffer. toneEnabled gates the whole tone-map chain (0 = raw
// pass-through for LDR / additive sources) and preserveAlpha decides whether
// the output carries the source's coverage or a forced opaque 1.0: two u32s
// because they answer independent questions. hdrKnee / hdrHeadroom are 0 in
// every SDR draw. Lanes 8–17 are the film grade, written only for a film draw
// and read only by the FILM pipeline variant (fragment.wesl's 'override FILM').
//
// | offset | field         | type | | offset | field       | type |
// | ------ | ------------- | ---- | | ------ | ----------- | ---- |
// | 0      | exposure      | f32  | | 40     | splitTone   | f32  |
// | 4      | whitepointSq  | f32  | | 44     | grain       | f32  |
// | 8      | asinhSoftness | f32  | | 48     | grainSizePx | f32  |
// | 12     | curve         | u32  | | 52     | vignette    | f32  |
// | 16     | toneEnabled   | u32  | | 56     | chromaticPx | f32  |
// | 20     | preserveAlpha | u32  | | 60     | softnessPx  | f32  |
// | 24     | hdrKnee       | f32  | | 64     | squeeze     | f32  |
// | 28     | hdrHeadroom   | f32  | | 68     | seed        | u32  |
// | 32     | contrast      | f32  | | 72, 76 | pad         |      |
// | 36     | lift          | f32  | |        |             |      |

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
  contrast: f32,
  lift: f32,
  splitTone: f32,
  grain: f32,
  grainSizePx: f32,
  vignette: f32,
  // Aberration smear and edge-softness disc radius, in px at the frame corner.
  chromaticPx: f32,
  softnessPx: f32,
  // Anamorphic ratio 1..2: the softness disc and the vignette stretch along x.
  squeeze: f32,
  // Per-frame grain seed, 'EngineState.frameIndex'.
  seed: u32,
  pad0: f32,
  pad1: f32,
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
