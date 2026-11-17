// horizonShell/fragment.wesl — analytic ray-sphere intersection +
// Fresnel-rim shading for the observable-universe horizon shell.
//
// Each fragment builds its world-space view ray from the camera basis
// (origin = camera, direction from the frustum + NDC), then solves for the
// ray's intersection with the sphere centred at the world origin and
// shades the hit point with a Fresnel rim so the silhouette glows and
// the face-on centre fades to transparent.
//
// All position math is in GIGAPARSECS (camera-relative): the camera is
// the ray origin (0), the sphere centre is '-cameraPosGpc', radius is
// 'radiusGpc'.  Keeping these small makes the quadratic's
// 'dot(center, center)' term (~900 Gpc²) precise in fp32.

import package::horizonShell::io::Uniforms;
import package::horizonShell::io::VsOut;
import package::lib::fresnel::fresnelRim;

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var cmbMap: texture_2d<f32>;
@group(0) @binding(2) var cmbSampler: sampler;

// ── Tuning constants ───────────────────────────────────────────────
const RIM_POWER: f32 = 3.0;
const SHELL_COLOR: vec3<f32> = vec3<f32>(0.35, 0.55, 0.80);
const INTENSITY: f32 = 0.25;
// The CMB map's additive weight. Seen from outside, the shell IS the subject;
// from inside, its far wall is the backdrop behind the galaxy surveys.
const CMB_OUTSIDE: f32 = 0.6;
const CMB_INSIDE: f32 = 0.18;
const PI: f32 = 3.14159265;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  // World-space view ray for this pixel, from the camera basis + frustum.
  let rayDir = normalize(
    uniforms.rayAxis
    + input.ndc.x * uniforms.tanHalfX * uniforms.camRight
    + input.ndc.y * uniforms.tanHalfY * uniforms.camUp,
  );

  // Sphere centre relative to the camera (= ray origin at 0), in Gpc.
  let center = -uniforms.cameraPosGpc;

  // Ray-sphere intersection.  With origin at 0 and |rayDir| = 1:
  //   t² - 2·(rayDir·center)·t + (|center|² - r²) = 0
  //   t = (rayDir·center) ± sqrt(disc),  disc = centerAlongRay² - |center|² + r²
  let centerAlongRay = dot(rayDir, center);
  let disc = centerAlongRay * centerAlongRay - dot(center, center) + uniforms.radiusGpc * uniforms.radiusGpc;
  if (disc < 0.0) {
    // Ray misses the shell — transparent (carves the crisp silhouette).
    discard;
  }
  let sqrtDisc = sqrt(disc);
  let tNear = centerAlongRay - sqrtDisc;
  let tFar = centerAlongRay + sqrtDisc;
  // Camera outside the shell → near hit is the visible surface; inside
  // → near hit is behind us, take the far wall.
  let hitDistance = select(tFar, tNear, tNear > 0.0);
  if (hitDistance < 0.0) {
    discard;
  }

  let hit = rayDir * hitDistance;                 // camera-relative hit point (Gpc)
  let normal = normalize(hit - center); // outward sphere normal
  let viewDir = -rayDir;                // points back toward the camera

  let rim = fresnelRim(normal, viewDir, RIM_POWER);
  // Distance fade (CPU-side smoothstep) scales the whole additive
  // contribution, so the shell ramps in as the camera pulls back.
  let value = rim * INTENSITY * uniforms.fadeAlpha;

  // The CMB at this point of the shell: the outward normal is the direction
  // from the observer (the world origin) to it, which the map stores by
  // galactic longitude and latitude. Explicit LOD: the seam at l = 0 would
  // otherwise spike the derivatives into a one-pixel streak.
  let galactic = transpose(uniforms.galToWorld) * normal;
  let longitude = atan2(galactic.y, galactic.x);
  let mapUv = vec2<f32>(fract(longitude / (2.0 * PI)), 0.5 - asin(clamp(galactic.z, -1.0, 1.0)) / PI);
  let cmbWeight = select(CMB_INSIDE, CMB_OUTSIDE, tNear > 0.0);
  let cmb = textureSampleLevel(cmbMap, cmbSampler, mapUv, 0.0).rgb * cmbWeight * uniforms.fadeAlpha;

  return vec4<f32>(SHELL_COLOR * value + cmb, value);
}
