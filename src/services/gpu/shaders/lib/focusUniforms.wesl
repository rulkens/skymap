// lib/focusUniforms.wesl — shared 'which POI is focused' uniform, written
// once per frame from clusterFocusSubsystem state. blend=0 collapses the
// per-vertex multiplier to 1.0 (no effect); when active, galaxies in the
// focused structure's core (within physicalRadiusMpc) keep alpha 1.0, and
// the rest ramp down to 0.08 across the band out to the apparent edge
// (centerApparent.w), scaled by the smoothstep blend.
//
// The physical..apparent ramp is what avoids a sharp circular membership
// ring: a smoothstep across the core radius -> apparent radius band gives a
// soft halo. The shader caps the inner edge below the apparent radius (see
// FOCUS_CORE_FRACTION) so the smoothstep never sees a degenerate
// edge0 == edge1, even when the two radii are equal (SC/void).
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
// Byte layout (32 bytes total).  centerApparent is a vec4 rather than a
// vec3 + separate f32 ON PURPOSE: WGSL packs a scalar that follows a
// vec3<f32> into the vec3's empty 4th lane (byte offset 12), but a naive
// std140-style CPU packer pads the vec3 to 16 bytes and writes the scalar
// at byte 16 — a one-slot skew that corrupts every field after it.  A
// vec4 has a single unambiguous 16-byte slot, so CPU and GPU agree.
//   offset  0 : centerApparent     vec4<f32>  (xyz = center Mpc, w = apparentRadiusMpc)
//   offset 16 : blend              f32        0..1 smoothstep
//   offset 20 : physicalRadiusMpc  f32        core radius — smoothstep inner edge
//   offset 24 : _pad1              f32
//   offset 28 : _pad2              f32

struct FocusUniforms {
  centerApparent: vec4<f32>,
  blend: f32,
  physicalRadiusMpc: f32,
  _pad1: f32,
  _pad2: f32,
};

// Fraction of the apparent radius the fully-bright core is capped to.
// Superclusters and voids carry no wider apparent extent (apparent ==
// physical), which would collapse the smoothstep to a hard ring; capping
// the inner edge at 60% of the apparent radius guarantees a soft fade band
// (>= 40% of the radius) for every category.
const FOCUS_CORE_FRACTION: f32 = 0.6;

// Per-vertex focus alpha multiplier. Galaxies inside the core (the smaller
// of physicalRadiusMpc and 60% of the apparent radius) keep alpha 1.0;
// alpha ramps smoothly down to 0.08 across the band out to the apparent
// radius (centerApparent.w) and stays 0.08 beyond, all mixed by blend. At
// blend == 0 this is a branch-free 1.0.
fn focusAlphaMultiplier(worldPos: vec3<f32>, focus: FocusUniforms) -> f32 {
  let apparent = focus.centerApparent.w;
  let inner = min(focus.physicalRadiusMpc, apparent * FOCUS_CORE_FRACTION);
  let d = distance(worldPos, focus.centerApparent.xyz);
  let t = smoothstep(inner, apparent, d);
  let baseAlpha = mix(1.0, 0.08, t);
  return mix(1.0, baseAlpha, focus.blend);
}
