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
//   NodeParams — the per-node uniform the renderer binds with a DYNAMIC
//                OFFSET, one 256-byte-strided block per drawn octree node.
//                It carries everything a node's records need that is NOT in
//                the record itself: the node box origin (already rebased
//                camera-relative in f64 by starNodeOriginRelCamMpc, then
//                narrowed to f32), the box scale, the record-blob base
//                offset for this node's slice, and the source crossfade
//                opacity. Written ONCE per frame per source (never mutated
//                mid-frame — see the renderer header on the writeBuffer /
//                submit ordering trap); the per-node draw selects its block
//                purely by changing the dynamic offset, not by a buffer
//                write.
//   StarUniforms — the @group(0) per-frame uniform: the shared 80-byte
//                'CameraUniforms' prefix (rebased vp + viewportPx) followed
//                by the user's base star-dot size 'sizePx' and star-brightness
//                trim 'brightness'. The mirror of the galaxy points 'Uniforms
//                { cam: CameraUniforms, ..., pointSizePx, brightness, ... }'
//                shape — both scalars are source-independent, so they ride the
//                camera uniform that is already shared/idempotent across every
//                source's draw this frame (see the renderer header) rather than
//                being duplicated into every NodeParams block.

import package::lib::camera::CameraUniforms;

// Per-frame @group(0) uniform. Byte layout (WGSL std140 uniform rules) must
// stay byte-exact with the renderer's camera-uniform write:
//
//   offset  0  cam        CameraUniforms  (80 B; viewProj + viewportPx + 2 pads)
//   offset 80  sizePx     f32             (user base star-dot size in px)
//   offset 84  brightness f32             (user exposure trim; 1.0 = identity)
//   struct size 96 (rounded up to the prefix's 16-byte alignment; the two
//   scalars share the same rounding tail, so appending brightness did not grow
//   the struct).
struct StarUniforms {
  cam: CameraUniforms,
  sizePx: f32,
  brightness: f32,
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
  // star's flux; an aggregate carries its whole subtree's summed flux — so the
  // two deposit the same total whether or not the walker refined the node.
  @location(3) intensity: f32,
};

// Per-drawn-node uniform. Byte layout (WGSL std140 uniform rules) must stay
// byte-exact with the renderer's per-node write:
//
//   offset  0  originRelCamMpc vec3<f32>  (box origin, camera-relative Mpc)
//   offset 12  cellScaleMpc    f32        (box edge in Mpc; offset unit = /1024)
//   offset 16  firstRecord     u32        (base index into the records blob)
//   offset 20  opacity         f32        (source crossfade alpha)
//   offset 24  level           u32        (octree level: 0 = leaf, >0 aggregate)
//   struct size 32 (rounded up to the vec3's 16-byte alignment — 'level' rides
//   the pad the vec3 alignment already reserved, so the stride is unchanged).
//
// 'level' is the leaf-vs-aggregate discriminant the format deliberately keeps
// OUT of the record (the record's 5 spare bits stay zero — see
// starCatalogFormat.ts), recovered instead from the owning node. The vertex
// stage needs it because a leaf record is a POINT source (one star) while an
// aggregate record is an EXTENDED source (a whole subtree collapsed to its
// box): the glow fills the box footprint for the latter but not the former.
struct NodeParams {
  originRelCamMpc: vec3<f32>,
  cellScaleMpc: f32,
  firstRecord: u32,
  opacity: f32,
  level: u32,
};
