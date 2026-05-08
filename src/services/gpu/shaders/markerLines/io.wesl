// markerLines/io.wesl — shared structs + bind-group for the marker-line
// renderer (the vertical "you are here" line and any future world-anchored
// thin-line marker).
//
// ## Why a separate marker-line renderer instead of reusing filaments?
//
// Filaments are an emissive overlay using ADDITIVE blend with per-segment
// density driving brightness/tint — they're a scientific data layer that
// the user reads through, not a UI element.  Marker lines are UI overlay
// (premultiplied OVER blend, fixed colour per line, fade-alpha gate)
// and must occlude rather than accumulate.  Sharing one renderer would
// mean either branching the blend state at draw time (adds a per-draw
// pipeline switch) or compromising the filament case.  Two small
// pipelines is cleaner.
//
// ## Vertex layout (mirrors filaments' instanced-quad expansion)
//
// One instance per line segment.  uv.x picks endpoint (0 = from,
// 1 = to); uv.y picks side (0 or 1 → ±half-width in screen-space
// perpendicular).  6 vertices per instance (two triangles forming a
// screen-aligned thick rectangle between the two endpoints).
//
// ## Bind-group convention
//
// One uniform binding at @group(0) @binding(0) holding the shared
// CameraUniforms prefix only — no renderer-specific tail.  Per-line
// state (endpoints, color, width, fade) lives on the per-instance
// vertex attributes, not in a storage buffer, because there's no
// indirect lookup needed: every quad already gets the segment's
// endpoints through its instance stride.

import package::lib::camera::CameraUniforms;

struct Uniforms {
  // 80-byte universal camera prefix.  Bytes 0..63 = viewProj,
  // 64..71 = viewportPx (drives the screen-space half-width math),
  // 72..79 = the two reserved pad floats (CPU writer must zero them).
  cam: CameraUniforms,
};

// ── per-vertex + per-instance attributes ──────────────────────────
//
// Two-buffer vertex layout matching filaments': location 0 is
// per-quad-vertex (the unit-quad UV), locations 1..3 are per-instance.
// The CPU writer in `markerLineRenderer.ts` packs each instance into
// 48 bytes (three vec4s):
//
//   [0..15]  fromAndWidth  vec4<f32>  (fromWorld.xyz, pixelWidth)
//   [16..31] toAndAlpha    vec4<f32>  (toWorld.xyz, fadeAlpha)
//   [32..47] color         vec4<f32>  (rgba premultiplied)
//
// Packing pixelWidth and fadeAlpha into the trailing slot of the
// world-position vec3s saves 16 bytes per instance versus carrying
// them as separate vec4 attributes — same trick as the filament
// renderer's `density` field tucked into the `vec4` after each
// world-position.

struct VsIn {
  // Unit-quad UV (0,0) (1,0) (0,1) (1,1) from a separate 4-vertex
  // buffer with stepMode 'vertex'.
  @location(0) uv: vec2<f32>,
  // From-endpoint world position + line half-width in CSS pixels.
  // .xyz = world Mpc, .w = pixelWidth (full width; the vertex stage
  // halves it before applying as ±perpendicular offset).
  @location(1) fromAndWidth: vec4<f32>,
  // To-endpoint world position + alpha fade multiplier.
  // .xyz = world Mpc, .w = fadeAlpha (multiplied into the final colour).
  @location(2) toAndAlpha: vec4<f32>,
  // Premultiplied rgba — colour is constant along the line; the
  // fragment stage multiplies in fadeAlpha and the soft-edge falloff.
  @location(3) color: vec4<f32>,
};

// ── vertex-to-fragment interface ──────────────────────────────────
//
// We pass the unit-quad uv through unchanged so the fragment stage
// can compute the soft anti-aliased edge perpendicular to the line
// (uv.y goes 0..1 across the line's width).  `color` is constant
// per-instance, but routing it through varying-interpolation is
// cheaper than re-binding a per-instance uniform — and trivially
// correct because the linear interpolant of a constant is itself.

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
};
