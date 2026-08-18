// planet/vertex.wesl — vertex stage for the instanced flat-lit albedo planet.
//
// The uploaded 'uvSphereMesh' is NOT the surface. This stage inflates it by
// 'PROXY_SCALE' into a shell that circumscribes the body, and the fragment
// recovers the analytic sphere per pixel ('lib/analyticSphere.wesl'), so all
// this stage owes it is a point on each fragment's view ray. The renderer pairs
// that with 'cullMode: front' -- the deficit arithmetic, the 5% margin and the
// far-hemisphere argument all live with the constant in the lib.
//
// ## Attribute layout (matches planetRenderer's pipeline descriptor byte-for-byte)
//
//   @location(0) position: vec3<f32>  — unit-sphere vertex; per-vertex, stride 12
//   @location(1..4) mvp0..mvp3        — MVP columns (64 B) } per-instance record,
//   @location(5) albedo: vec4<f32>    — rgb in .xyz (16 B) } stride 112. WESL has
//   @location(6) sunDir: vec4<f32>    — body-local sun .xyz  no mat4 attribute
//   @location(7) camPos: vec4<f32>    — camera in body-local .xyz, the ray origin
//
// One instanced draw paints every seeded planet, so the per-body data rides
// instance-step attributes rather than a uniform mutated between draws: that is
// the house idiom ('galaxyPointRenderer'), and decisively it dodges the
// writeBuffer-vs-submit race, since every instance reads its OWN baked record.
// The mvp and the local camera are forwarded to the fragment because the
// fragment cannot read vertex attributes and needs both for the ray test and
// the analytic depth.

import package::bodies::planet::io::VSOut;
import package::lib::analyticSphere::PROXY_SCALE;
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
  @location(7) camPos: vec4<f32>,
) -> VSOut {
  var out: VSOut;
  // Column-major reassembly: mat4x4<f32>(c0, c1, c2, c3) takes each vec4 as a
  // COLUMN, matching the column-major MVP 'composeBodyMvp' narrows to f32.
  let mvp = mat4x4<f32>(mvp0, mvp1, mvp2, mvp3);
  let proxy = position * PROXY_SCALE;
  out.clip = clip_from_local(mvp, proxy);
  out.localPos = proxy;
  out.albedo = albedo.xyz;
  out.sunDirLocal = sunDir.xyz;
  out.camPosLocal = camPos.xyz;
  out.mvp0 = mvp0;
  out.mvp1 = mvp1;
  out.mvp2 = mvp2;
  out.mvp3 = mvp3;
  return out;
}
