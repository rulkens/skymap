// lib/volume.wesl — the shared geometry contract between the three volume
// consumers: the density bake, the light bake, and the runtime raymarcher.
//
// One axis-aligned world-space box holds the whole nebula. Its extents are
// COMPILE-TIME constants shared through this module so all three shaders
// agree byte-for-byte on the world↔texture mapping — the classic failure
// mode of split volume pipelines is a half-voxel or scale mismatch between
// bake and render that shows up as light leaking through dense pillars.
// Baking the box into the shaders (rather than a model-matrix uniform)
// removes that entire bug class for the spike; a placeable nebula would
// re-introduce the matrix and inherit the runtime engine's inverse-model
// normalisation care (see src/services/gpu/shaders/scalarVolume/
// fragment.wesl for that story).
//
// Units are arbitrary "scene units" (the camera orbits at 3–10 units). The
// box is taller than wide because the subject is vertical columns; the
// real M16 pillars are ~4–5 light-years tall, so one scene unit reads as
// roughly a light-year — irrelevant to the math, but it keeps parameter
// intuition anchored.

const VOLUME_MIN = vec3<f32>(-1.2, -1.5, -1.2);
const VOLUME_MAX = vec3<f32>(1.2, 1.5, 1.2);

// Transmittance values are stored sqrt-encoded in the 8-bit light volume:
// encode = sqrt(T), decode = v². sqrt spends more of the 256 codes near
// T = 0, which is where the eye is most sensitive to banding (the deep
// shadow inside a pillar fading to its lit skin). A linear encoding bands
// visibly there; sqrt pushes the banding below the dither floor.
fn decodeTransmittance(v: f32) -> f32 {
  return v * v;
}

fn encodeTransmittance(t: f32) -> f32 {
  return sqrt(clamp(t, 0.0, 1.0));
}

// worldToVolumeUv — world position → [0,1]³ texture coordinate.
fn worldToVolumeUv(p: vec3<f32>) -> vec3<f32> {
  return (p - VOLUME_MIN) / (VOLUME_MAX - VOLUME_MIN);
}

// intersectVolumeBox — ray vs the nebula's world AABB. Returns (tEnter,
// tExit) along the ray with tEnter clamped to 0, so a camera inside the
// box starts marching from itself; a miss returns tExit < tEnter and the
// caller discards. Same slab method as the runtime engine's
// intersectUnitAabb, restated against this box's world extents.
fn intersectVolumeBox(rayOrigin: vec3<f32>, rayDir: vec3<f32>) -> vec2<f32> {
  let invDir = 1.0 / rayDir;
  let t0 = (VOLUME_MIN - rayOrigin) * invDir;
  let t1 = (VOLUME_MAX - rayOrigin) * invDir;
  let tMinV = min(t0, t1);
  let tMaxV = max(t0, t1);
  let tMin = max(max(tMinV.x, tMinV.y), tMinV.z);
  let tMax = min(min(tMaxV.x, tMaxV.y), tMaxV.z);
  return vec2<f32>(max(tMin, 0.0), tMax);
}

// Chromatic extinction tint — interstellar dust extinguishes blue light
// more strongly than red (the σ ∝ λ⁻¹-ish slope of the Milky Way
// extinction curve; the reason sunsets and dust-reddened stars are red).
// The vector is a per-channel multiplier on optical depth τ, so
// transmittance per channel is T_rgb = T^tint = exp(-tint·τ): B decays
// fastest, R slowest. Values are a perceptual fit to R_V ≈ 3.1 galactic
// dust rather than an exact Fitzpatrick curve — close enough that
// background stars visibly redden through pillar edges, which is the
// physical cue we're after.
const EXTINCTION_TINT = vec3<f32>(0.72, 1.0, 1.45);

// applyChromaticTransmittance — lift a baked GRAY transmittance T=exp(-τ)
// into per-channel transmittance exp(-tint·τ) without ever storing τ:
// pow(T, k) = exp(-k·τ) exactly. This is why the light bake only needs one
// 8-bit channel per star — chromatic shadowing is recovered analytically.
fn applyChromaticTransmittance(t: f32) -> vec3<f32> {
  return pow(vec3<f32>(t), EXTINCTION_TINT);
}
