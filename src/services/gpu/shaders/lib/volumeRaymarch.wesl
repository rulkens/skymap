// lib/volumeRaymarch.wesl — shared ray-setup skeleton for volume renderers
// that march a cube's local-space AABB: reconstruct the camera ray in the
// cube's LOCAL space, find its entry/exit against the unit cube, and (once
// inside) shape the march with a spherical falloff that hides the cube's
// axis-aligned corners. Pass-specific accumulation (jitter, palette,
// contrast windowing, ...) stays in each renderer's own fragment.wesl.

struct LocalRay {
  origin: vec3<f32>,
  dir: vec3<f32>,
};

// Reconstruct the camera-to-fragment ray in WORLD space, then transform
// into the cube's LOCAL space (where the AABB is the unit cube).
//
// Critical: normalize the local-space direction AFTER the inverse-model
// transform. The model matrix scales the unit cube up to its world size
// (e.g. 200 Mpc), so invModel scales directions DOWN by the same factor.
// A world-space unit direction becomes magnitude ~1/scale in local space.
// If we leave it unnormalized, the AABB-intersection 't' is in those
// tiny-direction units (tMax ≈ scale, not ≈ 1), and stepLength =
// (tMax-tMin)/N becomes huge — per-step alpha saturates in 1-2 samples
// and the order-of-accumulation effect makes inside views look BRIGHTER
// than outside ones (peak hits first → instant saturation in peak
// colour, no attenuation). Normalizing here puts 't' in local-space
// distance units, so the unit cube spans t ∈ [0, √3] at most and
// per-step opacity stays in a sane regime.
fn localRayFromWorld(invModel: mat4x4<f32>, cameraPosWorld: vec3<f32>, worldPos: vec3<f32>) -> LocalRay {
  let origin = (invModel * vec4<f32>(cameraPosWorld, 1.0)).xyz;
  let dirWorld = normalize(worldPos - cameraPosWorld);
  let dir = normalize((invModel * vec4<f32>(dirWorld, 0.0)).xyz);
  return LocalRay(origin, dir);
}

// Ray-vs-axis-aligned-unit-AABB intersection in the cube's LOCAL space
// (the cube spans [0, 1]^3 in local coords).  Returns the (tMin, tMax)
// range along the ray, with tMin clamped to 0 so a ray origin inside
// the cube starts marching from the origin.  If the ray misses the cube
// entirely, returns tMax < tMin and the caller discards.
fn intersectUnitAabb(rayOrigin: vec3<f32>, rayDir: vec3<f32>) -> vec2<f32> {
  let invDir = 1.0 / rayDir;
  let t0 = -rayOrigin * invDir;
  let t1 = (vec3<f32>(1.0) - rayOrigin) * invDir;
  let tMinV = min(t0, t1);
  let tMaxV = max(t0, t1);
  let tMin = max(max(tMinV.x, tMinV.y), tMinV.z);
  let tMax = min(min(tMaxV.x, tMaxV.y), tMaxV.z);
  return vec2<f32>(max(tMin, 0.0), tMax);
}

// Spatial envelope: smoothstep falloff in local-space cube
// coordinates, used to fade the cube's corner regions to invisible
// so the axis-aligned silhouette of the bounding box doesn't show.
// localPos is the per-step sample point in [0, 1]^3, inner and
// outer are normalised distances from the cube center where the
// inscribed sphere has radius 1.0 (so corners sit at √3 ≈ 1.73).
//
// When inner >= outer (the degenerate "no envelope" case using the
// sentinel inner == outer >= √3), smoothstep returns 0 throughout
// the cube because dev never exceeds either edge, and the function
// returns 1.0 — visually identical to no envelope at all.  No
// branching needed.
fn sphericalEnvelope(localPos: vec3<f32>, inner: f32, outer: f32) -> f32 {
  // Center the cube on the origin in cube-space, scale by 2 so the
  // inscribed sphere has radius 1.0 (matches the convention used by
  // the per-cube envelopeInner/envelopeOuter uniforms).
  let radius = length(localPos - vec3<f32>(0.5)) * 2.0;
  return 1.0 - smoothstep(inner, outer, radius);
}
