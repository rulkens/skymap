// flowCompute.wesl — particle integration for the cosmic-flow field visualization.
//
// This is the compute half of the flow-field renderer, ported from the
// standalone 'cosmic-flow' spike into the main engine. It integrates a large
// array of tracer particles through a 3D velocity texture ('velTex'), the
// CF4++ peculiar-velocity field resampled into the unit cube [0,1]^3. Two
// integration modes share one buffer layout:
//
//   - mode 0 'advect': a Lagrangian pathline. Each particle marches forward
//     along the local flow each steady frame, leaving a fading ring-buffer
//     trail behind the head. When it exits the box or out-lives 'LIFE' it
//     respawns. A per-particle 'acc' accumulator carries the sub-trailStep
//     distance between frames so trail samples are laid down at an even arc
//     length regardless of the variable per-frame headStep.
//
//   - mode 1 'streamline': an Eulerian instantaneous streamline. Each steady
//     frame the whole trail is RE-DERIVED from scratch by walking the field
//     forward and backward from the particle's seed point. There is no carried
//     state between frames here — the trail is a snapshot of the field, not a
//     history.
//
// WHY a dedicated 'seed' entry point (the deliberate change vs the spike):
// the spike folded the respawn-everything work into both 'advect' and
// 'streamline' behind an 'if (prm.seedFlag == 1u)' branch and a 'seedFlag'
// uniform field. That coupled the one-time initialization to the steady-frame
// integrators and forced every dispatch to carry a now-or-later flag. We split
// it out: 'seed' is dispatched once at construction (and on reseed), and the
// two integrators became PURE steady-frame kernels with the branch deleted.
// The 'seedFlag' field is gone from 'Prm' entirely.
//
// We use ONE shared 'seed' kernel for both modes. It does the advect-style full
// seed: density-weighted spawn via 'pickSpawn', a staggered initial age, a
// collapse of the entire trail ring onto the spawn point, and a reset of the
// 'acc' accumulator. This is a strict superset of what streamline needs:
// streamline re-derives its trail every steady frame from 'parts[i]' anyway, so
// the pre-filled trail ring and the zeroed 'acc' are simply harmless for it.
// Sharing one kernel avoids a second near-identical entry point whose only
// difference would be the omission of two harmless writes — not worth the
// duplication.
//
// The 'acc' buffer at @binding(5) is advect-only state, but it stays declared
// here (and in the shared bind-group layout) for ALL THREE pipelines. WGSL
// permits an unused module-scope binding; keeping it lets the three pipelines
// share one explicit BGL rather than maintaining per-pipeline layouts that
// differ by a single binding.
//
// The velocity texture's alpha channel does double duty: 'overdensity' reads
// '.w * DENS_SCALE' as a density delta to bias spawn placement toward
// structure, while the trail stores 'length(vel.xyz)' as the local speed for
// the colour ramp. Both readings of the same texture are intentional.
//
// Prm uniform byte layout (48 bytes; TS pads the tail — see flowFieldConstants
// + the flow renderer's uniform docblock). seedFlag is intentionally ABSENT:
//   dt        f32 @ 0
//   trailStep f32 @ 4
//   headStep  f32 @ 8
//   n         u32 @ 12
//   frame     u32 @ 16
//   mode      u32 @ 20   (advect=0 / streamline=1)
//   bias      f32 @ 24
//   wander    f32 @ 28

import package::flow::flowConstants::TRAIL;
import package::flow::flowConstants::LIFE;
import package::flow::flowConstants::DENS_SCALE;

const DIR_EPS = vec3<f32>(1e-6);
const MIN_TRAVEL: f32 = 1e-9;
const SEED_TRIES: u32 = 16u;
const PARTICLE_SALT: u32 = 8u;
const FRAME_SALT: u32 = 9781u;
const AGE_SALT: u32 = 100u;
const WANDER_SALT: u32 = 257u;

@group(0) @binding(0) var<storage, read_write> parts: array<vec4<f32>>;   // xyz = position, w = age
@group(0) @binding(1) var velTex: texture_3d<f32>;                        // rgb = velocity, a = speed / overdensity
@group(0) @binding(2) var velSamp: sampler;
struct Prm { dt:f32, trailStep:f32, headStep:f32, n:u32, frame:u32, mode:u32, bias:f32, wander:f32 };
@group(0) @binding(3) var<uniform> prm: Prm;
@group(0) @binding(4) var<storage, read_write> trail: array<vec4<f32>>;   // ring of (xyz, speed) per particle
@group(0) @binding(5) var<storage, read_write> acc: array<f32>;           // advect only; bound for all three

fn pcgHash(vin:u32)->u32 { var s=vin*747796405u+2891336453u; let w=((s>>((s>>28u)+4u))^s)*277803737u; return (w>>22u)^w; }
fn rand01(seed:u32)->f32 { return f32(pcgHash(seed))/4294967295.0; }
fn randomStream(i: u32) -> u32 { return i*PARTICLE_SALT + prm.frame*FRAME_SALT; }
fn insideBox(p: vec3<f32>) -> bool { return all(p >= vec3<f32>(0.0)) && all(p <= vec3<f32>(1.0)); }

fn overdensity(p: vec3<f32>) -> f32 {
  return clamp(textureSampleLevel(velTex, velSamp, p, 0.0).w * DENS_SCALE, 0.0, 1.0);
}

fn pickSpawn(base: u32, bias: f32) -> vec3<f32> {
  var stream = base;
  var bestPos = vec3<f32>(rand01(stream), rand01(stream + 1u), rand01(stream + 2u));
  var bestWeight = overdensity(bestPos);
  stream = stream + 3u;
  for (var tryIdx: u32 = 0u; tryIdx < SEED_TRIES; tryIdx = tryIdx + 1u) {
    let cand = vec3<f32>(rand01(stream), rand01(stream + 1u), rand01(stream + 2u));
    let candWeight = overdensity(cand);
    if (rand01(stream + 3u) < mix(1.0, candWeight, bias)) { return cand; }
    if (candWeight > bestWeight) { bestPos = cand; bestWeight = candWeight; }
    stream = stream + 4u;
  }
  return bestPos;
}

// One-time (and on-reseed) initializer shared by both modes. Does the full
// advect-style seed: density-weighted spawn, staggered age, trail-ring collapse
// onto the spawn point, and acc reset. A superset of what streamline needs.
@compute @workgroup_size(64)
fn seed(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= prm.n) { return; }
  let base = i * TRAIL;
  let sb = randomStream(i);
  let spawn = pickSpawn(sb, prm.bias);
  let spawnVel = textureSampleLevel(velTex, velSamp, spawn, 0.0);
  for (var k: u32 = 0u; k < TRAIL; k = k + 1u) { trail[base + k] = vec4<f32>(spawn, length(spawnVel.xyz)); }
  parts[i] = vec4<f32>(spawn, rand01(sb + AGE_SALT) * LIFE);
  acc[i] = 0.0;
}

@compute @workgroup_size(64)
fn advect(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= prm.n) { return; }
  let base = i * TRAIL;

  var head = parts[i].xyz;
  let age = parts[i].w + prm.dt;
  var carried = acc[i];
  var toGo = min(prm.headStep, prm.trailStep * f32(TRAIL));
  var rs = randomStream(i) + WANDER_SALT;

  loop {
    let step = min(toGo, prm.trailStep - carried);
    let vel = textureSampleLevel(velTex, velSamp, head, 0.0);
    let jitter = vec3<f32>(rand01(rs) - 0.5, rand01(rs + 1u) - 0.5, rand01(rs + 2u) - 0.5);
    rs = rs + 3u;
    let dir = normalize(normalize(vel.xyz + DIR_EPS) + jitter * prm.wander);
    head = head + dir * step;
    carried = carried + step;
    toGo = toGo - step;
    if (!insideBox(head) || age > LIFE) {
      let spawn = pickSpawn(randomStream(i), prm.bias);
      let spawnVel = textureSampleLevel(velTex, velSamp, spawn, 0.0);
      for (var k: u32 = 0u; k < TRAIL; k = k + 1u) { trail[base + k] = vec4<f32>(spawn, length(spawnVel.xyz)); }
      parts[i] = vec4<f32>(spawn, 0.0);
      acc[i] = 0.0;
      return;
    }
    if (carried >= prm.trailStep) {
      carried = carried - prm.trailStep;
      for (var k: u32 = 0u; k < TRAIL - 1u; k = k + 1u) { trail[base + k] = trail[base + k + 1u]; }
      trail[base + TRAIL - 1u] = vec4<f32>(head, length(vel.xyz));
    }
    if (toGo <= MIN_TRAVEL) { break; }
  }
  let headVel = textureSampleLevel(velTex, velSamp, head, 0.0);
  trail[base + TRAIL - 1u] = vec4<f32>(head, length(headVel.xyz));
  parts[i] = vec4<f32>(head, age);
  acc[i] = carried;
}

@compute @workgroup_size(64)
fn streamline(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= prm.n) { return; }
  let base = i * TRAIL;
  let seed = parts[i].xyz;
  let mid: i32 = i32(TRAIL) / 2;
  trail[base + u32(mid)] = vec4<f32>(seed, length(textureSampleLevel(velTex, velSamp, seed, 0.0).xyz));
  var walk = seed;
  for (var k: i32 = mid - 1; k >= 0; k = k - 1) {
    let vel = textureSampleLevel(velTex, velSamp, walk, 0.0);
    let next = walk - normalize(vel.xyz + DIR_EPS) * prm.trailStep;
    if (insideBox(next)) { walk = next; }
    trail[base + u32(k)] = vec4<f32>(walk, length(textureSampleLevel(velTex, velSamp, walk, 0.0).xyz));
  }
  walk = seed;
  for (var k: i32 = mid + 1; k < i32(TRAIL); k = k + 1) {
    let vel = textureSampleLevel(velTex, velSamp, walk, 0.0);
    let next = walk + normalize(vel.xyz + DIR_EPS) * prm.trailStep;
    if (insideBox(next)) { walk = next; }
    trail[base + u32(k)] = vec4<f32>(walk, length(textureSampleLevel(velTex, velSamp, walk, 0.0).xyz));
  }
}
