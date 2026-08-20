// milkyWay/pick/io.wesl — shared structs for the Milky-Way pick billboard.
//
// The Milky Way draws no visible geometry through this pipeline — it is a
// pick-only, screen-size-clamped billboard at the galactic centre whose
// sole job is to stamp the MW identity into the r32uint pick texture.
// Both the vertex stage (milkyWay/pick/vertex.wesl) and the pick fragment
// (milkyWay/pick/pick.wesl) agree on the structs declared here, so a
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
//   @group(0) Uniforms — a prefix mirror of the points pick uniform
//             image (points/io.wesl::Uniforms).  pickMilkyWay binds its
//             OWN buffer here: the MW is the sole pickable in the NEAR0
//             pick pass, so there is no caller-bound slot 0 to inherit.
//             The BYTES are still the full points pick image — the layer
//             builds them with pickUniformBytesOf, the same packer the
//             points pick uses — so the mirrored struct below must
//             byte-match the points layout for every field it declares.
//             Reads extend through 'pxPerRad' at byte 108 — i.e. the
//             first 112 bytes of that image, not just the 80-byte
//             CameraUniforms prefix — because the vertex stage derives
//             the billboard's apparent size the same way the points
//             shader does (camPosWorld + pxPerRad + the pointSizePx
//             floor).
//   @group(1) FadeUniforms — declared for layout symmetry with the
//             points / structure pick pipelines (the prior pass left a
//             fade bind group at slot 1).  This shader never reads it; a
//             dummy zeroed group is bound at draw time.
//   @group(2) MilkyWayPickUniforms — carries the world-space galactic
//             centre, the 5-bit source code, and the disc's world
//             radius; all written once at construction.

import package::lib::camera::CameraUniforms;

// ── @group(0) points-pick uniform mirror ──────────────────────────────
//
// Field-for-field prefix of 'points/io.wesl::Uniforms' — same names,
// same offsets — truncated after the last field this shader reads.
// Mirroring the points layout (rather than inventing a private camera
// struct) is what lets the MW draw consume the pickUniformBytesOf image
// verbatim and read the exact camera facts the pick pass replays:
//
//   offset 0  : cam            CameraUniforms (80 B)
//   offset 80 : selectedPacked u32   (unread here)
//   offset 84 : _pad0          u32
//   offset 88 : pointSizePx    f32   (pick-widened floor — see below)
//   offset 92 : brightness     f32   (unread here)
//   offset 96 : camPosWorld    vec3<f32>
//   offset 108: pxPerRad       f32
//   total: 112 bytes — the bound buffer (176 B) is larger, which WGSL
//   permits: a uniform binding may be bigger than the declared struct.
//
// 'pointSizePx' in the PICK buffer is already the pick-widened value —
// the pick pack bakes (sizePx + PICK_PADDING_PX) into the slot
// (pickUniformBytesOf; PICK_PADDING_PX lives in data/pickPaddingPx.ts) —
// so using it as the MW floor gives the MW the same padded minimum every
// pick point gets.
struct Uniforms {
  cam: CameraUniforms,
  selectedPacked: u32,
  _pad0: u32,
  pointSizePx: f32,
  brightness: f32,
  camPosWorld: vec3<f32>,
  pxPerRad: f32,
};

// ── @group(2) per-source uniform ──────────────────────────────────────
//
// Carries the world-space billboard centre, the source code, and the
// disc's physical radius.  The structure ring path keeps the centre in
// a per-instance vertex buffer and the code in a SourceUniforms block;
// the MW is a single fixed billboard, so co-locating everything in one
// tiny uniform is simpler than a one-instance vertex buffer.
//
//   offset 0  : centerWorld  vec3<f32>  (Sgr A* world position)
//   offset 12 : sourceCode   u32        (Source.MilkyWay = 16)
//   offset 16 : radiusMpc    f32        (world radius of the rendered
//                                         disc — MILKY_WAY_RADIUS_MPC)
//
// centerWorld + sourceCode fill bytes 0..15; radiusMpc takes the next
// 16-byte slot at offset 16 (WGSL pads the struct to a 16-byte multiple),
// so the buffer is 32 bytes.  Every field is a physical constant of the
// scene, written once at construction — the vertex stage projects
// radiusMpc to apparent pixels itself, so nothing here tracks the camera.
struct MilkyWayPickUniforms {
  centerWorld: vec3<f32>,
  sourceCode: u32,
  radiusMpc: f32,
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
  // Pre-packed '(sourceCode << 26) | (0 + PICK_SENTINEL_OFFSET)'
  // identity.  Flat-interpolated — integers can't be linearly
  // interpolated and all six vertices share the value.
  @location(1) @interpolate(flat) packedPick: u32,
};
