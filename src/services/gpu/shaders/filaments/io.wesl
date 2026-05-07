// filaments/io.wesl — shared structs for the cosmic-web filament pipeline.
//
// This file is the 'interface' module of the filament renderer family.
// It declares the structs that BOTH the vertex and fragment entry
// points need to agree on byte-for-byte:
//
//   - 'Uniforms'   — the @group(0) @binding(0) uniform buffer layout.
//   - 'PerVertex'  — per-quad-vertex + per-instance vertex attributes.
//   - 'VSOut'      — the vertex-to-fragment interface.
//
// ## Why a separate io module
//
// Originally everything lived in a single 'filaments.wesl'. Splitting
// it into io + vertex + fragment mirrors the points/ and milkyWay/
// splits (tasks 13 and 14) so each stage compiles a strictly-smaller
// shader module from disjoint source. The vertex stage doesn't need
// the cloud-fade or mask helpers; the fragment stage doesn't need
// 'worldToClip'.
//
// ## Why bindings live in the consuming files, not here
//
// WESL has no global state — '@group(N) @binding(M) var<uniform> X'
// is a module-local declaration, not an exportable symbol. Each
// consuming file redeclares its bindings using the structs imported
// from this single authoritative module so the layout numbers cannot
// drift between vertex and fragment.

import package::lib::camera::CameraUniforms;

// ── Uniforms layout (CameraUniforms-prefixed) ──────────────────────
//
// The first 80 bytes are the shared 'CameraUniforms' prefix from
// 'lib/camera.wesl' (viewProj at offset 0, viewportPx at offset 64,
// two reserved-pad f32s at 72/76). The next two f32 slots at offsets
// 80 and 84 hold this renderer's two scalar parameters; offsets
// 88..95 are an explicit 8-byte tail pad to round the struct up to
// a 16-byte multiple. Total: 96 bytes.
//
// CPU-side counterpart in 'filamentRenderer.ts' writes halfWidthPx
// at f32-index 20 (byte 80) and intensityScale at f32-index 21
// (byte 84) — see UNIFORM_BYTES there.

struct Uniforms {
  cam : CameraUniforms,
  halfWidthPx : f32,       // line half-width in pixels (offset 80)
  // Per-frame uniform scale for the entire filament-pass output, [0..1].
  // Multiplied into the final pre-multiplied colour + alpha. Lets the
  // user dim the cosmic-web overlay against the bright HDR catalogue
  // when high-σ skeletons (with their longer, denser ridges) saturate
  // to flat white under the tone-mapped pass.
  intensityScale : f32,    // offset 84
  _pad0 : f32,             // offset 88 — see struct comment above
  _pad1 : f32,             // offset 92
};

// ── per-vertex attributes ──────────────────────────────────────────
//
// Two-buffer vertex layout: location 0 is per-quad-vertex (the unit-
// quad UV), locations 1..4 are per-instance (the segment endpoints).
// The renderer's vertex-buffer descriptor in filamentRenderer.ts has
// to match this struct's location numbers exactly.

struct PerVertex {
  @location(0) uv : vec2<f32>,           // (0..1, 0..1) — quad-corner UV
  @location(1) startPos : vec3<f32>,     // segment start in world Mpc
  @location(2) startDensity : f32,       // 0..1
  @location(3) endPos : vec3<f32>,       // segment end in world Mpc
  @location(4) endDensity : f32,         // 0..1
};

// ── vertex-to-fragment interface ────────────────────────────────────
//
// 'uv' carries through the per-quad-vertex coordinate so the fragment
// stage can compute the soft edge falloff perpendicular to the
// segment. 'density' is per-segment-endpoint linearly interpolated
// across the line, driving the brightness + tint modulation.

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) uv : vec2<f32>,
  @location(1) density : f32,
};
