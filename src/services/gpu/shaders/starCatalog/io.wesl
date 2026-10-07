// starCatalog/io.wesl — shared struct declarations for the survey-star
// (Gaia bin) point pipeline. Imported by starCatalog/vertex.wesl and
// starCatalog/fragment.wesl.
//
// The survey stars render as additive point-sprite billboards in the
// depthless HDR accumulation — the same visual species as the seeded
// scene stars ('bodies/starPoints') and the survey galaxy points, but fed
// from an in-file octree of cell-quantized 6-byte records rather than a
// flat instance buffer. The vertex stage vertex-PULLS one record per
// instance from a per-source storage blob, reconstructs its world position
// from the owning octree node's origin, and expands it into the 3-vertex
// circumscribing-triangle billboard; the fragment stage draws the soft
// Gaussian dot in the record's spectral tint. Two structs travel between
// the CPU renderer and these stages:
//
//   VSOut      — the vertex/fragment contract (one authoritative
//                declaration makes @location drift structurally impossible,
//                the same reasoning bodies/starPoints/io.wesl states).
//   StarUniforms — the @group(0) per-frame uniform: the shared 80-byte
//                'CameraUniforms' prefix (rebased vp + viewportPx) followed
//                by the user's base star-dot size 'sizePx', star-brightness
//                trim 'brightness', aggregate glow spread 'glowOverlap' and
//                aggregate peak ceiling 'aggregateIntensityCap'. The
//                mirror of the galaxy points 'Uniforms { cam: CameraUniforms,
//                ..., pointSizePx, brightness, ... }' shape — the scalars
//                are source-independent, so they ride the camera uniform that is
//                already shared/idempotent across every source's draw this frame
//                (see the renderer header).

import package::lib::camera::CameraUniforms;

// Per-frame @group(0) uniform. Byte layout (WGSL std140 uniform rules) must
// stay byte-exact with the renderer's camera-uniform write:
//
//   offset  0  cam                   CameraUniforms  (80 B; viewProj + viewportPx + 2 pads)
//   offset 80  sizePx                f32             (user base star-dot size in px)
//   offset 84  brightness            f32             (user exposure trim; 1.0 = identity)
//   offset 88  glowOverlap           f32             (aggregate glow spread; 1.0 = identity)
//   offset 92  pickPass              u32             (0 = visual, 1 = pick)
//   offset 96  aggregateIntensityCap f32             (peak ceiling for aggregates)
//   offset 100 pxPerRad              f32             (target px per radian, toRefPx)
//   struct size 112 (rounded up to the prefix's 16-byte alignment; the six
//   scalars overflow the first 16-byte tail, so 'aggregateIntensityCap' opens a
//   second one and 8 bytes at 104..111 are pure pad).
//
// 'pickPass' (float index 23, byte 92) is written only by the pick pipeline. The
// VISUAL draw never writes it -- the renderer's per-source camera write stops at
// 'glowOverlap' (float 22) plus floats 24-25 ('aggregateIntensityCap',
// 'pxPerRad') and the
// scratch is zero-init -- so the visual pipeline reads pickPass == 0 and takes
// the visual path. Only the sibling 'starCatalogPickRenderer' writes it = 1 into
// its OWN uniform buffer, which flips the vertex stage's ~3 px
// clickable-footprint floor on (so a sub-pixel star still covers a pickable
// pixel at its true screen position) and routes the record identity to the pick
// fragment. Baking the flag into the uniform rather than compiling a second
// vertex module keeps the two pipelines drawing ONE shared vertex stage -- the
// same one-flag-not-two-modules choice the galaxy points pipeline made.
//
// 'aggregateIntensityCap' is the user's 'Fog cap' knob: the vertex stage clamps
// an AGGREGATE record's peak intensity to it (leaves stay uncapped), taming the
// box-filling glow a near sub-threshold aggregate deposits as fog around the
// Sun. The pick pipeline draws leaves only, so it leaves this slot zero-init --
// and 'pxPerRad' too: the pick fragment ignores the intensity it feeds.
struct StarUniforms {
  cam: CameraUniforms,
  sizePx: f32,
  brightness: f32,
  glowOverlap: f32,
  pickPass: u32,
  aggregateIntensityCap: f32,
  pxPerRad: f32,
};

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  // Triangle corner in circumscribing-triangle space — the fragment's
  // distance-from-centre (the unit disc is inscribed, so r2 > 1 is discarded).
  @location(0) uv: vec2<f32>,
  // Per-star linear-RGB spectral tint, constant across the triangle.
  @location(1) color: vec3<f32>,
  // Source crossfade alpha, constant across the triangle.
  @location(2) opacity: f32,
  // Flux-derived peak intensity, constant across the triangle. The vertex
  // stage sizes the dot from the record's flux + apparent extent and hands the
  // matching peak here; the fragment scales the Gaussian by it so a record's
  // INTEGRATED screen luminance is proportional to its flux (see
  // starCatalog/vertex.wesl's photometric derivation). A leaf carries one
  // star's flux; an aggregate carries its subtree's MEAN star flux, which the
  // vertex stage multiplies by the subtree star count to recover the summed
  // light — so the two deposit the same total whether or not the cut refined
  // the node.
  @location(3) intensity: f32,
  // Bin-global record index of this instance's record — the node's firstRecord
  // plus the instance's place within the node, the same index the vertex stage
  // already computed to vertex-pull the record. It is the value 'resolveStarRecord'
  // decodes a pick's localIdx back into (the pick fragment packs it into the
  // r32uint texture; see starCatalog/pickFragment.wesl). Flat-interpolated
  // because integers cannot be linearly interpolated and all three triangle
  // vertices of one instance share the value. Only the pick fragment reads it;
  // the visual fragments ('fs' / 'fsLinear') declare 'in: VSOut' but ignore it,
  // so carrying it costs the visual pass one unused flat varying and nothing more.
  @location(4) @interpolate(flat) recordIdx: u32,
};
