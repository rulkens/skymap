// quads/io.wesl — shared structs for the textured-billboard galaxy
// thumbnail pipeline.
//
// This file is the 'interface' module of the quads renderer family.
// It declares the structs that BOTH the vertex and fragment entry
// points need to agree on byte-for-byte:
//
//   - 'Uniforms'   — the @group(0) @binding(0) uniform buffer layout.
//   - 'InstanceIn' — the per-instance vertex attributes.
//   - 'VsOut'      — the vertex-to-fragment interface.
//
// ## Why a separate io module
//
// Originally everything lived in a single 'quads.wesl'. Splitting it
// into io + vertex + fragment mirrors the points/ and milkyWay/
// splits (tasks 13 and 14) so each stage compiles a strictly-smaller
// shader module from disjoint source. The vertex stage doesn't read
// the atlas texture; the fragment stage doesn't compute the
// celestial-north billboard basis.
//
// ## Why bindings live in the consuming files, not here
//
// WESL has no global state — bindings are module-local declarations
// that cannot be exported. The vertex stage redeclares the uniform
// binding (it reads camera + viewport + camPosWorld + pxPerRad);
// the fragment stage redeclares the texture + sampler bindings (it
// samples the 2048x2048 atlas). Both reference the same Uniforms
// struct from this file so the layout cannot drift.

import package::lib::camera::CameraUniforms;

// ── Uniforms layout (CameraUniforms-prefixed) ──────────────────────
//
// 96-byte uniform buffer matching the CPU-side UNIFORM_BYTES in
// 'quadRenderer.ts'.  The first 80 bytes are the shared
// 'CameraUniforms' prefix (viewProj at offset 0, viewportPx at
// offset 64, two reserved-pad f32s at 72/76). The next 16 bytes
// carry this renderer's two camera-derived but renderer-specific
// fields: 'camPosWorld' (a vec3<f32> needing 16-B alignment, which
// offset 80 already provides) and 'pxPerRad' which fits in the
// trailing slot of camPosWorld's 16-B vec4 quantum.
//
// 'camPosWorld' + 'pxPerRad' were added when the original
// 'project-a-unit-X-offset' billboard sizing turned out to depend on
// camera orientation (orbiting a galaxy made the quad visibly shrink
// or grow as the world-X axis rotated relative to the view direction).
// The replacement computes each quad's apparent angular radius from
// 'length(instance.posSize.xyz - camPosWorld)' and converts to screen
// pixels via 'pxPerRad = viewport.y / (2 · tan(fovY / 2))'.  Identical
// approach to points.wesl — see that file for the derivation.

struct Uniforms {
  cam: CameraUniforms,
  camPosWorld: vec3<f32>,  // offset 80
  pxPerRad: f32,           // offset 92
};

// ── per-instance attributes ────────────────────────────────────────
//
// Per-instance attributes.  Three vec4s — first packs (xyz,
// sizeWorld), second is the uv rect, third carries the per-frame
// 'fadeAlpha' multiplier produced by the engine (distance fade ×
// load fade).  All naturally 16-byte aligned.  The remaining three
// components of 'extras' are reserved padding for future per-
// instance flags.

struct InstanceIn {
  @location(0) posSize: vec4<f32>,
  @location(1) uvRect:  vec4<f32>,
  @location(2) extras:  vec4<f32>,
};

// ── vertex-to-fragment interface ────────────────────────────────────

struct VsOut {
  @builtin(position) clipPos:   vec4<f32>,
  // UV inside the atlas — used to sample the bitmap.  Maps the slot's
  // sub-rectangle of the 2048×2048 atlas.
  @location(0)       atlasUv:   vec2<f32>,
  // UV inside the corner-local [0, 1]² unit square — used to compute
  // the radial alpha mask in 'fs'.  Independent of atlasUv because the
  // atlas slot might not occupy the full corner range when slot UV
  // rectangles get clamped or padded.  Threading both lets us decouple
  // 'which texel to sample' from 'where am I in the quad shape'.
  @location(1)       cornerUv:  vec2<f32>,
  // Per-instance fade multiplier in [0, 1].  Constant across all six
  // vertices of one instance, so flat interpolation would be cheaper
  // — but a single forwarded float costs nothing either way and we
  // can re-use the smooth interpolation slot for the load fade if it
  // ever needs to vary across the quad.
  @location(2)       fadeAlpha: f32,
};
