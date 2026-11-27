// lib/volumeRaymarch.wesl — ray setup for marching a cube in its local space, where the box is
// [0,1]³: the camera ray brought into that space, its span through an AABB, and a spherical
// falloff that hides the cube's axis-aligned corners.

struct LocalRay {
  origin: vec3<f32>,
  dir: vec3<f32>,
};

// Normalize AFTER invModel: it shrinks directions by the cube's size, so t would come out in
// world-size units and per-step alpha would saturate in a sample or two (inside views turning
// brighter than outside). Normalized, t is local distance and the cube spans at most √3.
fn localRayFromWorld(invModel: mat4x4<f32>, cameraPosWorld: vec3<f32>, worldPos: vec3<f32>) -> LocalRay {
  let origin = (invModel * vec4<f32>(cameraPosWorld, 1.0)).xyz;
  let dirWorld = normalize(worldPos - cameraPosWorld);
  let dir = normalize((invModel * vec4<f32>(dirWorld, 0.0)).xyz);
  return LocalRay(origin, dir);
}

// (tMin, tMax) along the ray; tMin clamps to 0, so an origin inside starts there. A miss gives
// tMax < tMin.
fn intersectAabb(rayOrigin: vec3<f32>, rayDir: vec3<f32>, boxLo: vec3<f32>, boxHi: vec3<f32>) -> vec2<f32> {
  let invDir = 1.0 / rayDir;
  let tLowSlab = (boxLo - rayOrigin) * invDir;
  let tHighSlab = (boxHi - rayOrigin) * invDir;
  let tMinV = min(tLowSlab, tHighSlab);
  let tMaxV = max(tLowSlab, tHighSlab);
  let tMin = max(max(tMinV.x, tMinV.y), tMinV.z);
  let tMax = min(min(tMaxV.x, tMaxV.y), tMaxV.z);
  return vec2<f32>(max(tMin, 0.0), tMax);
}

// 1 inside `inner`, 0 past `outer`; radius is twice the distance from the cube's centre, so the
// inscribed sphere is 1 and the corners √3. Both edges ≥ √3 is no envelope, without a branch.
fn sphericalEnvelope(localPos: vec3<f32>, inner: f32, outer: f32) -> f32 {
  let radius = length(localPos - vec3<f32>(0.5)) * 2.0;
  return 1.0 - smoothstep(inner, outer, radius);
}
