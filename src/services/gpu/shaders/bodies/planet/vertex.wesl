// planet/vertex.wesl — vertex stage for the instanced flat-lit albedo planet.
//
// Projection wiring parallels 'earth/vertex.wesl' and 'star/vertex.wesl':
// multiply each unit-sphere local position by the combined MVP, and pass the
// local position through as an interpolant. For a unit sphere the local
// position IS the outward surface normal, so no separate normal stream is
// needed — the fragment stage normalises the interpolant and runs its
// one-dot-product lambert term against the per-instance sun direction (see
// 'planet/fragment.wesl').
//
// The surface normal stays in the body's LOCAL frame, and the per-instance
// 'sunDirLocal' is the sun direction the CPU already rotated into that same
// local frame ('utils/camera/sunDirLocal.ts'), so the fragment's lambert dot
// is co-framed even when the body carries an axial tilt in its baked
// 'orientation' (composeBodyMvp embeds it as T·R·S). The mesh itself is the
// z-up equatorial J2000 'uvSphereMesh', so 'localPos' z points at the body's
// north pole before that tilt.
//
// ## Why per-instance attributes, not a per-draw uniform
//
// One renderer draws every seeded planet in a SINGLE instanced 'drawIndexed'.
// The per-body MVP + albedo arrive as instance-step vertex attributes (one
// record per '@builtin(instance_index)'), not a uniform mutated between draws.
// That is the house idiom ('galaxyPointRenderer'): one 'writeBuffer' + one draw
// beats N per-body binds, and — decisively — it dodges the writeBuffer-vs-
// submit race by construction, since every instance reads its own baked
// record rather than a uniform that the last write would have clobbered for
// all draws. WESL has no mat4 vertex-attribute type, so the MVP is streamed as
// four vec4<f32> columns and reassembled here.
//
// ## Attribute layout (matches the TS pipeline descriptor byte-for-byte)
//
//   @location(0) position: vec3<f32>  — unit-sphere local vertex
//                                       (per-vertex, tight f32x3 VBO, stride 12)
//   @location(1) mvp0: vec4<f32>      — MVP column 0  } per-instance record,
//   @location(2) mvp1: vec4<f32>      — MVP column 1  } stride 96: four MVP
//   @location(3) mvp2: vec4<f32>      — MVP column 2  } columns (64 B) + albedo
//   @location(4) mvp3: vec4<f32>      — MVP column 3  } (rgb + 1 pad, 16 B) +
//   @location(5) albedo: vec4<f32>    — surface colour rgb in .xyz, .w unused
//   @location(6) sunDir: vec4<f32>    — body-local sun direction in .xyz,
//                                       .w unused (16 B)

import package::bodies::planet::io::VSOut;
import package::lib::sphere::clip_from_local;

@vertex
fn vs(
  @location(0) position: vec3<f32>,
  @location(1) mvp0: vec4<f32>,
  @location(2) mvp1: vec4<f32>,
  @location(3) mvp2: vec4<f32>,
  @location(4) mvp3: vec4<f32>,
  @location(5) albedo: vec4<f32>,
  @location(6) sunDir: vec4<f32>,
) -> VSOut {
  var out: VSOut;
  // Column-major reassembly: mat4x4<f32>(c0, c1, c2, c3) takes each vec4 as a
  // COLUMN, matching the column-major MVP 'composeBodyMvp' narrows to f32.
  let mvp = mat4x4<f32>(mvp0, mvp1, mvp2, mvp3);
  out.clip = clip_from_local(mvp, position);
  out.localPos = position;
  out.albedo = albedo.xyz;
  out.sunDirLocal = sunDir.xyz;
  return out;
}
