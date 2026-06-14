// lib/flow.wesl — shared helpers for the cosmic-flow field renderer's compute
// and render passes.
//
// Hoisted out of 'flow/compute.wesl' and 'flow/vertex.wesl'. The pcg-hash /
// rand01 pair was formerly copy-pasted in both; collecting every flow helper
// here gives it one home and lets the two passes import rather than duplicate.
//
// GPU resources the originals read straight from module scope — the velocity
// texture + sampler, the camera matrices — become PARAMETERS here, because a
// 'lib' module declares no bindings of its own (WGSL bindings are module-local
// and cannot be imported). Callers pass their own bound 'velTex' / 'cam.model'
// / etc. in. textureSampleLevel is used throughout (explicit LOD, no implicit
// derivatives), so passing the sampler through a function boundary raises no
// uniformity concern.
//
// This module also owns the flow RNG salts — the shader-private magic numbers
// that decorrelate the per-particle hash. Two (PARTICLE_SALT, FRAME_SALT) feed
// randomStream here; the other two (AGE_SALT, WANDER_SALT) are consumed by the
// compute entry points, which import them — kept together so the whole salt set
// lives in one place. The parity-guarded field tunables (TRAIL, DENS_SCALE, ...)
// stay in 'flow/constants.wesl' and arrive as parameters ('densScale' below).

// RNG stream salts — decorrelate the per-particle hash across uses.
const PARTICLE_SALT: u32 = 8u;
const FRAME_SALT: u32 = 9781u;
const AGE_SALT: u32 = 100u;
const WANDER_SALT: u32 = 257u;
// Density-rejection tries for a spawn point (pickSpawn).
const SEED_TRIES: u32 = 16u;

// pcgHash — u32 -> u32 avalanche. The de-facto GPU integer hash; far better
// distributed across u32 seeds than a sin-based float hash.
fn pcgHash(vin: u32) -> u32 {
  var s = vin * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}

// rand01 — deterministic pseudo-random in [0, 1) from a u32 seed.
fn rand01(seed: u32) -> f32 {
  return f32(pcgHash(seed)) / 4294967295.0;
}

// randomStream — per-particle RNG stream offset, decorrelating particle 'i'
// across 'frame'.
fn randomStream(i: u32, frame: u32) -> u32 {
  return i * PARTICLE_SALT + frame * FRAME_SALT;
}

// insideBox — unit-cube [0,1]^3 containment test for a grid-space position.
fn insideBox(p: vec3<f32>) -> bool {
  return all(p >= vec3<f32>(0.0)) && all(p <= vec3<f32>(1.0));
}

// gridToWorld — grid [0,1]^3 -> world via the cube's model matrix.
fn gridToWorld(model: mat4x4<f32>, voxel: vec3<f32>) -> vec3<f32> {
  return (model * vec4<f32>(voxel, 1.0)).xyz;
}

// gridToClip — grid [0,1]^3 -> clip space. 'mvp' is view-projection (no model);
// 'model' places the cube in the world.
fn gridToClip(mvp: mat4x4<f32>, model: mat4x4<f32>, voxel: vec3<f32>) -> vec4<f32> {
  return mvp * vec4<f32>(gridToWorld(model, voxel), 1.0);
}

// overdensity — overdensity delta at a grid point: the velocity texture's alpha
// channel scaled by 'densScale' and clamped to [0,1]. Biases spawn placement
// toward structure.
fn overdensity(velTex: texture_3d<f32>, velSamp: sampler, densScale: f32, p: vec3<f32>) -> f32 {
  return clamp(textureSampleLevel(velTex, velSamp, p, 0.0).w * densScale, 0.0, 1.0);
}

// pickSpawn — density-weighted spawn point: rejection-samples up to SEED_TRIES
// candidates, accepting one with probability mix(1, overdensity, bias); falls
// back to the densest candidate seen.
fn pickSpawn(velTex: texture_3d<f32>, velSamp: sampler, densScale: f32, base: u32, bias: f32) -> vec3<f32> {
  var stream = base;
  var bestPos = vec3<f32>(rand01(stream), rand01(stream + 1u), rand01(stream + 2u));
  var bestWeight = overdensity(velTex, velSamp, densScale, bestPos);
  stream = stream + 3u;
  for (var tryIdx: u32 = 0u; tryIdx < SEED_TRIES; tryIdx = tryIdx + 1u) {
    let cand = vec3<f32>(rand01(stream), rand01(stream + 1u), rand01(stream + 2u));
    let candWeight = overdensity(velTex, velSamp, densScale, cand);
    if (rand01(stream + 3u) < mix(1.0, candWeight, bias)) { return cand; }
    if (candWeight > bestWeight) { bestPos = cand; bestWeight = candWeight; }
    stream = stream + 4u;
  }
  return bestPos;
}
