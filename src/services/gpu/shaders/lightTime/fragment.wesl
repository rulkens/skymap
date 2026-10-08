// lightTime/fragment.wesl — analytic unit-sphere rims, summed additively.
//
// For a unit sphere at the origin and a unit ray direction, the cosine between
// the surface normal and the ray at either hit is exactly sqrt(disc), so the
// Fresnel rim needs no hit point and no normalisation.

import package::lightTime::io::Uniforms;
import package::lightTime::io::VsOut;

@group(0) @binding(0) var<uniform> u: Uniforms;

const RIM_POWER: f32 = 3.0;
const TINT: vec3<f32> = vec3<f32>(0.55, 0.75, 1.0);
const INTENSITY: f32 = 0.35;
// Below this the glow is invisible (most of each disc's interior).
const VISIBLE_FLOOR: f32 = 0.0005;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  let rd = normalize(
    u.camForward
    + input.ndc.x * u.tanHalfFovY * u.aspect * u.camRight
    + input.ndc.y * u.tanHalfFovY * u.camUp,
  );

  var sum = vec3<f32>(0.0);
  for (var i = 0u; i < u32(u.count); i = i + 1u) {
    let s = u.spheres[i];
    let b = dot(s.roOpacity.xyz, rd);
    let disc = b * b - s.c.x;
    if (disc < 0.0) {
      continue;
    }
    let sq = sqrt(disc);
    // The far root must be ahead of the eye: both are when outside, only the
    // far wall is when inside.
    if (-b + sq <= 0.0) {
      continue;
    }
    // sq rounds a hair above 1 at the disc centre, and pow of a negative base is NaN.
    let rim = pow(max(1.0 - sq, 0.0), RIM_POWER);
    sum = sum + TINT * rim * INTENSITY * s.roOpacity.w;
  }

  let peak = max(sum.x, max(sum.y, sum.z));
  if (peak < VISIBLE_FLOOR) {
    discard;
  }
  return vec4<f32>(sum, peak);
}
