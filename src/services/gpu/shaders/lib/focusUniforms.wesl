// lib/focusUniforms.wesl — shared 'which POI is focused' uniform, written
// once per frame from clusterFocusSubsystem state. blend=0 collapses the
// per-vertex multiplier to 1.0 (no effect); when active, members keep alpha
// 1.0 and non-members fade to 0.08, scaled by the smoothstep blend.
//
// @group(3): @group(0) per-frame Uniforms, @group(1) FadeUniforms,
// @group(2) per-source SourceUniforms occupy the lower slots.
//
// Byte layout (32 bytes total):
//   offset  0 : center     vec3<f32>  (12 B payload + 4 B trailing pad)
//   offset 16 : radiusMpc  f32
//   offset 20 : blend      f32        0..1 smoothstep
//   offset 24 : invert     u32        0 = cluster/SC, 1 = void
//   offset 28 : _pad       u32

struct FocusUniforms {
  center: vec3<f32>,
  radiusMpc: f32,
  blend: f32,
  invert: u32,
  _pad: u32,
};

// Per-vertex focus alpha multiplier. invert=0 (cluster/SC) makes inside a
// member; invert=1 (void) makes outside a member. Members get alpha 1.0,
// others 0.08, mixed by blend. At blend == 0 this is a branch-free 1.0.
fn focusAlphaMultiplier(worldPos: vec3<f32>, focus: FocusUniforms) -> f32 {
  let isInside = distance(worldPos, focus.center) < focus.radiusMpc;
  let isMember = isInside == (focus.invert == 1u);
  let baseAlpha = select(0.08, 1.0, isMember);
  return mix(1.0, baseAlpha, focus.blend);
}
