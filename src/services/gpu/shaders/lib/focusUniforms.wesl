// lib/focusUniforms.wesl — shared 'which POI is focused' uniform, written
// once per frame from clusterFocusSubsystem state. blend=0 collapses the
// per-vertex multiplier to 1.0 (no effect); when active, members (galaxies
// inside the focused structure's sphere) keep alpha 1.0 and everything
// else fades to 0.08, scaled by the smoothstep blend.
//
// Clusters, superclusters and voids all behave identically: the focused
// structure's interior galaxies stay bright, the rest recede. (Voids are
// underdense, so focusing one isolates the few galaxies that sit inside
// its radius — same rule, no inversion.)
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
//   offset 20 : _pad0         f32
//   offset 24 : _pad1         f32
//   offset 28 : _pad2         f32

struct FocusUniforms {
  centerRadius: vec4<f32>,
  blend: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

// Per-vertex focus alpha multiplier. Galaxies inside the focused
// structure's sphere are members (alpha 1.0); everything else fades to
// 0.08, mixed by blend. At blend == 0 this is a branch-free 1.0.
fn focusAlphaMultiplier(worldPos: vec3<f32>, focus: FocusUniforms) -> f32 {
  let isMember = distance(worldPos, focus.centerRadius.xyz) < focus.centerRadius.w;
  let baseAlpha = select(0.08, 1.0, isMember);
  return mix(1.0, baseAlpha, focus.blend);
}
