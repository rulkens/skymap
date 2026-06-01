// lib/focusUniforms.wesl — shared 'which POI is focused' uniform.
//
// Written once per frame by the points pipeline from clusterFocusSubsystem
// state. When no POI is focused the CPU side writes blend=0 and the
// per-vertex multiplier collapses to 1.0 (no visible effect). When focus
// is active, members keep alpha 1.0 and non-members fade to 0.08, scaled
// by the smoothstep blend factor.
//
// @group(3) is the first free slot: @group(0) per-frame Uniforms,
// @group(1) FadeUniforms, @group(2) per-source SourceUniforms.
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

// Per-vertex focus alpha multiplier.
//   isInside = distance(worldPos, focus.center) < focus.radiusMpc
//   isMember = isInside == (focus.invert == 1u)
//     invert=0 (cluster/SC): inside  -> member
//     invert=1 (void):       outside -> member
//   baseAlpha = isMember ? 1.0 : 0.08
//   result    = mix(1.0, baseAlpha, focus.blend)
// At blend == 0 this returns 1.0 unconditionally — a branch-free no-op
// when nothing is focused.
fn focusAlphaMultiplier(worldPos: vec3<f32>, focus: FocusUniforms) -> f32 {
  let isInside = distance(worldPos, focus.center) < focus.radiusMpc;
  let isMember = isInside == (focus.invert == 1u);
  let baseAlpha = select(0.08, 1.0, isMember);
  return mix(1.0, baseAlpha, focus.blend);
}
