// lib/focusUniforms.wesl — shared 'which POI is focused' uniform, written
// once per frame from clusterFocusSubsystem state. blend=0 collapses the
// per-vertex multiplier to 1.0 (no effect); when active, members keep alpha
// 1.0 and non-members fade to 0.08, scaled by the smoothstep blend.
//
// The @group/@binding decoration is declared by each consuming shader, not
// here: points parks it at @group(3) (its lower slots hold Uniforms / Fade /
// Source), while the impostor disks have no intervening groups and use
// @group(1). A single shared bind group serves both — it binds to a layout,
// not a group number.
//
// Byte layout (32 bytes total).  centerRadius is a vec4 rather than a
// vec3 + separate f32 ON PURPOSE: WGSL packs a scalar that follows a
// vec3<f32> into the vec3's empty 4th lane (byte offset 12), but a naive
// std140-style CPU packer pads the vec3 to 16 bytes and writes the scalar
// at byte 16 — a one-slot skew that corrupts every field after it.  A
// vec4 has a single unambiguous 16-byte slot, so CPU and GPU agree.
//   offset  0 : centerRadius  vec4<f32>  (xyz = center Mpc, w = radiusMpc)
//   offset 16 : blend         f32        0..1 smoothstep
//   offset 20 : invert        u32        0 = cluster/SC, 1 = void
//   offset 24 : _pad0         u32
//   offset 28 : _pad1         u32

struct FocusUniforms {
  centerRadius: vec4<f32>,
  blend: f32,
  invert: u32,
  _pad0: u32,
  _pad1: u32,
};

// Per-vertex focus alpha multiplier. invert=0 (cluster/SC) makes inside a
// member; invert=1 (void) makes outside a member. Members get alpha 1.0,
// others 0.08, mixed by blend. At blend == 0 this is a branch-free 1.0.
fn focusAlphaMultiplier(worldPos: vec3<f32>, focus: FocusUniforms) -> f32 {
  let isInside = distance(worldPos, focus.centerRadius.xyz) < focus.centerRadius.w;
  // Membership is inside XOR invert: a cluster/SC (invert=0) counts inside
  // galaxies as members; a void (invert=1) counts outside galaxies (the
  // walls) as members so the galaxies within the void fade instead.
  let isMember = isInside != (focus.invert == 1u);
  let baseAlpha = select(0.08, 1.0, isMember);
  return mix(1.0, baseAlpha, focus.blend);
}
