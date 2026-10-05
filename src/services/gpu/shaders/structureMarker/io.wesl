// structureMarker/io.wesl — shared struct definitions for the halo + ring pipelines.
//
// Both pipelines (halo, ring) read the same CameraUniforms prefix and
// the same per-category SourceUniforms.  Co-locating the structs here
// (and re-importing them into halo.wesl + ring.wesl) means a layout
// edit (e.g. adding a uniform field) lands in one place and propagates
// to both consumers.
//
// ## Why no @group/@binding declarations here
//
// WESL has no global state — '@group(N) @binding(M) var<uniform> u'
// is module-local and cannot be exported across modules.  The
// consuming files (halo.wesl, ring.wesl) each redeclare the bindings
// using the structs imported from this file.  WGSL accepts the same
// @group/@binding pair across multiple compiled modules so long as the
// layout is identical; importing one authoritative struct definition
// makes drift structurally impossible.
//
// ## Uniforms layout — CameraUniforms prefix + the eye
//
// The 80-byte CameraUniforms prefix carries viewProj + viewportPx +
// pxPerRad + one pad.  Bytes 80..95 are 'camPosMpc': the eye in the
// same absolute-Mpc frame 'positionAndRadius.xyz' uses (w unused,
// float 23 zero-padded) — the vertex stage needs it to build the
// eye-facing world basis ('expandBillboardWorld'), which a
// view-projection matrix alone can't give it.  The CPU-side write
// site in structureMarkerRenderer.ts allocates 96 bytes.
//
// ## Why no per-vertex attribute struct
//
// quadCorner from lib/billboard.wesl maps @builtin(vertex_index) 0..5
// directly to the four corners (with two diagonal repeats).  We don't
// need a per-vertex attribute at all — the vertex stage calls
// quadCorner(vi) inline.  The VsIn struct below carries per-instance
// data only; the vertex stage sources its corner offset from the
// built-in vertex index, not from a vertex buffer attribute.

import package::lib::camera::CameraUniforms;

struct Uniforms {
  cam: CameraUniforms,
  // The eye, absolute Mpc — see the "Uniforms layout" doc above.
  camPosMpc: vec4<f32>,
};

// The marker radii in the data were tuned by eye against the old
// 'worldLenToPx' pixel path, which under-reported apparent size by
// tan(30 degrees) at the app's 60 degree fov.  Folding the same factor
// into the WORLD radius (rather than a pixel size, now that the quad is
// built in world space) keeps mono at 60 degrees looking as it always
// has.
const MARKER_RADIUS_RETUNE: f32 = 0.57735;

// ── per-instance attributes ───────────────────────────────────────
//
// One instance per structure marker.  The CPU writer in
// structureMarkerRenderer.ts packs each instance into 48 bytes
// (12 f32 slots) laid out as:
//
//   [0..15]  positionAndRadius   vec4<f32>  (centreWorld.xyz, physicalRadiusMpc)
//   [16..31] haloColorAndAlpha   vec4<f32>  (haloRgb, haloAlpha)
//   [32..47] ringColorAndAlpha   vec4<f32>  (ringRgb, ringAlpha)
//
// Packing the radius into the trailing slot of the world-position
// vec4 saves a vertex-attribute slot — same trick as markerLines'
// fromAndWidth.  haloAlpha / ringAlpha ride in the trailing slot of
// their respective colour vec4s for the same reason.
//
// History: at v1 ring colour was sourced from halo colour (rendering
// voids as black because they opt out of the halo).  v2 split them
// into a dedicated ringColorAndAlpha slot — same packing pattern as
// haloColorAndAlpha, so the fragment is symmetric across the two.

struct VsIn {
  // shaderLocation 0: world-space centre (xyz) + physicalRadiusMpc (w).
  // Packing them in one vec4 saves a vertex-attribute slot.
  @location(0) positionAndRadius: vec4<f32>,
  // shaderLocation 1: halo RGB (xyz) + haloAlpha (w).
  @location(1) haloColorAndAlpha: vec4<f32>,
  // shaderLocation 2: ring RGB (xyz) + ringAlpha (w).  Mirrors
  // haloColorAndAlpha's layout exactly so halo and ring vertex stages
  // pull from symmetric slots.
  @location(2) ringColorAndAlpha: vec4<f32>,
};

// ── vertex-to-fragment interface ──────────────────────────────────
//
// Both halo and ring fragment stages need the unit-quad UV (for
// distance-from-centre), the chosen tint, and a pre-applied alpha.
// The ring fragment additionally needs the ring's world radius; its
// on-screen band width comes from 'dpdx'/'dpdy' of 'uv' in the
// fragment stage now (see ring.wesl), not a smuggled pixel size, so
// there is no per-view scalar to carry here — 'uv' alone is enough in
// every view of a rig.

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  // UV is the unit-quad corner in [-1, +1]², used by both fragments
  // to compute distance from the billboard centre.
  @location(0) uv: vec2<f32>,
  // The tint chosen at the vertex stage (halo: haloColor; ring: ringColor).
  @location(1) color: vec3<f32>,
  // Pre-applied alpha (haloAlpha for the halo pipeline, ringAlpha for
  // the ring).  The vertex stage selects which one.
  @location(2) alpha: f32,
  // The world-space marker radius in Mpc.  Halo fragment ignores it.
  @location(3) radiusMpc: f32,
  // Per-instance structure index — assembled in the vertex stage from
  // @builtin(instance_index).  Consumed only by the ringPick fragment
  // (offscreen r32uint picking pass), which packs it together with
  // SourceUniforms.sourceCode into the canonical
  // (sourceCode << 26) | (structureIndex + PICK_SENTINEL_OFFSET) identity.
  //
  // The visual halo + ring fragments ignore it; it costs one extra
  // flat-interpolated u32 per vertex output and lets both pipelines
  // (visual + pick) share the same VsOut struct.  @interpolate(flat)
  // because integers can't be linearly interpolated and all six
  // vertices of one instance share the same value — same idiom as
  // points/io.wesl's `instanceIdx`.
  @location(4) @interpolate(flat) structureIndex: u32,
};
