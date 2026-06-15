// milkyWayPick/io.wesl — shared structs for the Milky-Way pick billboard.
//
// The Milky Way draws no visible geometry through this pipeline — it is a
// pick-only, screen-size-clamped billboard at the galactic centre whose
// sole job is to stamp the MW identity into the r32uint pick texture.
// Both the vertex stage (milkyWayPick/vertex.wesl) and the pick fragment
// (milkyWayPick/pick.wesl) agree on the structs declared here, so a
// layout edit lands in one place.
//
// ## Why no @group/@binding declarations here
//
// WESL has no global state — '@group(N) @binding(M) var<uniform> u' is
// module-local and cannot be exported across modules.  The consuming
// files redeclare the bindings using the structs imported from here.
// WGSL accepts the same @group/@binding pair across compiled modules so
// long as the layout matches; importing one authoritative struct makes
// drift structurally impossible.
//
// ## Bindings the pipeline declares
//
//   @group(0) CameraUniforms — the SAME 80-byte prefix the points pick
//             pass binds.  pickMilkyWay does NOT bind @group(0); it
//             reuses the caller's CameraUniforms (the galaxy pick draws
//             bound it immediately before), so the reads here
//             (viewProj + viewportPx) must stay inside that buffer.
//   @group(1) FadeUniforms — declared for layout symmetry with the
//             points / structure pick pipelines (the prior pass left a
//             fade bind group at slot 1).  This shader never reads it; a
//             dummy zeroed group is bound at draw time.
//   @group(2) MilkyWayPickUniforms — carries the world-space galactic
//             centre + the 5-bit source code, written once at
//             construction.

import package::lib::camera::CameraUniforms;

struct Uniforms {
  cam: CameraUniforms,
};

// ── @group(2) per-source uniform ──────────────────────────────────────
//
// Carries the world-space billboard centre, the source code, and the
// screen-pixel half-extent of the hit billboard.  The structure ring
// path keeps the centre in a per-instance vertex buffer and the code in
// a SourceUniforms block; the MW is a single fixed billboard, so
// co-locating everything in one tiny uniform is simpler than a
// one-instance vertex buffer.
//
//   offset 0  : centerWorld   vec3<f32>  (Sgr A* world position)
//   offset 12 : sourceCode    u32        (Source.MilkyWay = 16)
//   offset 16 : halfExtentPx  f32        (apparent radius of the MW disc,
//                                          floored — matches the ring)
//
// centerWorld + sourceCode fill bytes 0..15; halfExtentPx takes the next
// 16-byte slot at offset 16 (WGSL pads the struct to a 16-byte multiple),
// so the buffer is 32 bytes.  Unlike centre + code (written once at
// construction), halfExtentPx is rewritten each pick because it tracks
// the camera distance — the engine supplies it as data per draw.
struct MilkyWayPickUniforms {
  centerWorld: vec3<f32>,
  sourceCode: u32,
  halfExtentPx: f32,
};

// ── vertex-to-fragment interface ──────────────────────────────────────
//
// The pick fragment needs the unit-quad UV (to clip the billboard to an
// inscribed disk so the hit target reads circular) plus the pre-packed
// pick identity (flat-interpolated so the integer arrives unchanged
// across all six vertices).
struct VsOut {
  @builtin(position) pos: vec4<f32>,
  // Unit-quad corner in [-1, +1]², used by the fragment for the
  // distance-from-centre disk test.
  @location(0) uv: vec2<f32>,
  // Pre-packed '(sourceCode << 27) | (0 + PICK_SENTINEL_OFFSET)'
  // identity.  Flat-interpolated — integers can't be linearly
  // interpolated and all six vertices share the value.
  @location(1) @interpolate(flat) packedPick: u32,
};
