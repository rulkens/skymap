// constellations/io.wesl — shared structs for the true-3D constellation
// stick-figure overlay.
//
// This is the 'interface' module of the constellation renderer family: the
// structs the vertex and fragment stages must agree on byte-for-byte. It
// mirrors 'filaments/io.wesl' and 'markerLines/io.wesl' — the two existing
// instanced-quad thick-line renderers — because a constellation figure is the
// same primitive: one instance per line segment, expanded into a screen-aligned
// quad in the vertex stage (WebGPU's 'line-list' is 1-pixel-wide only, by spec).
//
// ## Why bindings are NOT declared here
//
// WESL has no global state, so '@group(N) @binding(M) var<uniform> X' is a
// module-local declaration, not an exportable symbol. Each consuming file
// (vertex / fragment) redeclares its bindings using the structs imported from
// this single authoritative module, so the layout numbers cannot drift between
// the two stages.

import package::lib::camera::CameraUniforms;

// ── Uniforms layout (CameraUniforms-prefixed) ──────────────────────
//
// The first 80 bytes are the shared 'CameraUniforms' prefix from
// 'lib/camera.wesl' (viewProj at offset 0, viewportPx at offset 64, two
// reserved pad f32s at 72/76). The two f32 slots at offsets 80 and 84 hold this
// renderer's scalars; offsets 88..95 are an explicit 8-byte tail pad rounding
// the struct to a 16-byte multiple. Total: 96 bytes — identical to the filament
// Uniforms, so the CPU-side 'writeCameraPrefix' + two scalar writes are the same
// packing (see 'constellationRenderer.ts' UNIFORM_BYTES).

struct Uniforms {
  cam : CameraUniforms,
  // Line half-width in CSS pixels (offset 80). Passed straight to
  // 'expandSegmentQuad', which takes a half-width.
  halfWidthPx : f32,
  // Per-frame scale on the whole overlay's emission, driven by the user's
  // constellation-intensity slider (offset 84). Multiplied into the fragment's
  // alpha alongside the fade opacity.
  intensity : f32,
  _pad0 : f32,             // offset 88 — see struct comment above
  _pad1 : f32,             // offset 92
};

// ── per-vertex + per-instance attributes ───────────────────────────
//
// Two-buffer layout matching filaments'/markerLines': location 0 is
// per-quad-vertex (the shared unit-quad UV), locations 1..4 are per-instance
// (the segment's two endpoints + their apparent magnitudes). One instance per
// constellation line segment; 6 vertices per instance (two triangles forming
// the screen-aligned thick rectangle).
//
// Byte layout of the per-instance stride (pinned; the CPU packer in
// 'constellationRenderer.ts' must match offset-for-offset):
//
//   offset  0 : aWorld  vec3<f32>  endpoint A, heliocentric equatorial Mpc
//   offset 12 : aAppMag f32        endpoint A apparent magnitude
//   offset 16 : bWorld  vec3<f32>  endpoint B, Mpc
//   offset 28 : bAppMag f32        endpoint B apparent magnitude
//   stride 32 bytes (8 f32).
//
// The artifact ships endpoints in PARSECS; the renderer scales them to Mpc at
// upload (ConstellationsArtifact: 'the renderer scales them into world units'),
// so this stage receives world Mpc like every other world-space vertex shader.
// The apparent magnitudes drive the per-endpoint screen-space gap in the vertex
// stage (brighter star ⇒ larger gap so the line clears its visible glow).

struct PerVertex {
  @location(0) uv : vec2<f32>,       // (0..1, 0..1) — quad-corner UV
  @location(1) aWorld : vec3<f32>,   // endpoint A, world Mpc (offset 0)
  @location(2) aAppMag : f32,        // endpoint A apparent mag (offset 12)
  @location(3) bWorld : vec3<f32>,   // endpoint B, world Mpc (offset 16)
  @location(4) bAppMag : f32,        // endpoint B apparent mag (offset 28)
};

// ── vertex-to-fragment interface ───────────────────────────────────
//
// Only 'uv' passes through: uv.y (0..1 across the line's width) drives the soft
// anti-aliased edge in the fragment stage; uv.x already did its work in the
// vertex stage (endpoint + gap selection). The single steel-blue tone and the
// intensity scale are constants/uniforms the fragment reads directly, so they
// need no varying.

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) uv : vec2<f32>,
};
