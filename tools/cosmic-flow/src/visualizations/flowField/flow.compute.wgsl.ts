/**
 * flow.compute.wgsl — the particle-integration compute module (advect +
 * streamline), ported verbatim from the spike.
 *
 * Two entry points share one module and one buffer layout:
 *   - advect    — particles physically drift through the field; each trail is a
 *                 genuine PATHLINE (the ring of the particle's real recent
 *                 positions). Binds the carried-distance accumulator at @5.
 *   - streamline — the seed is fixed, so the integrated curve is stationary and
 *                 the motion is a render-pass pulse along it. Omits @5.
 *
 * The TRAIL / LIFE / DENS_SCALE constants are injected from ./constants so the
 * TS buffer geometry and the WGSL ring length cannot drift. NOTE: comments
 * inside this template literal must not contain a backtick — it would terminate
 * the JS string. WGSL identifier references in comments use single quotes.
 *
 * Compute uniform 'Prm' byte layout (buffer is 48 bytes):
 *   dt        f32 @ 0
 *   trailStep f32 @ 4
 *   headStep  f32 @ 8
 *   n         u32 @ 12
 *   frame     u32 @ 16
 *   mode      u32 @ 20
 *   seedFlag  u32 @ 24
 *   bias      f32 @ 28
 *   wander    f32 @ 32
 */
import { TRAIL, LIFE, DENS_SCALE, wgslF } from './constants';

export const flowComputeWgsl: string = /* wgsl */ `
const TRAIL: u32 = ${TRAIL}u;
const LIFE: f32 = ${wgslF(LIFE)};               // advect particle lifetime (frame-time units)
const DENS_SCALE: f32 = ${wgslF(DENS_SCALE)};   // overdensity delta -> spawn weight
const DIR_EPS = vec3<f32>(1e-6);                // guards normalize() against a zero velocity
const MIN_TRAVEL: f32 = 1e-9;                   // advect loop stops when the remaining step is below this
const SEED_TRIES: u32 = 16u;                    // rejection-sampling attempts per spawn
// salts that give each particle / frame / purpose an independent random sub-stream
const PARTICLE_SALT: u32 = 8u;
const FRAME_SALT: u32 = 9781u;
const AGE_SALT: u32 = 100u;
const WANDER_SALT: u32 = 257u;                  // separate stream for per-step direction jitter

@group(0) @binding(0) var<storage, read_write> parts: array<vec4<f32>>;   // xyz = position, w = age
@group(0) @binding(1) var velTex: texture_3d<f32>;                        // rgb = velocity, a = speed (km/s)
@group(0) @binding(2) var velSamp: sampler;
struct Prm { dt:f32, trailStep:f32, headStep:f32, n:u32, frame:u32, mode:u32, seedFlag:u32, bias:f32, wander:f32 };
@group(0) @binding(3) var<uniform> prm: Prm;
@group(0) @binding(4) var<storage, read_write> trail: array<vec4<f32>>;   // ring of (xyz, speed) per particle
@group(0) @binding(5) var<storage, read_write> acc: array<f32>;           // advect: distance carried since last ring point

// PCG hash -> a uniform float in [0,1]
fn pcgHash(vin:u32)->u32 { var s=vin*747796405u+2891336453u; let w=((s>>((s>>28u)+4u))^s)*277803737u; return (w>>22u)^w; }
fn rand01(seed:u32)->f32 { return f32(pcgHash(seed))/4294967295.0; }

// base random stream for particle i this frame; the *_SALT offsets pick sub-streams off it
fn randomStream(i: u32) -> u32 { return i*PARTICLE_SALT + prm.frame*FRAME_SALT; }
fn insideBox(p: vec3<f32>) -> bool { return all(p >= vec3<f32>(0.0)) && all(p <= vec3<f32>(1.0)); }

// Overdensity weight straight from the reconstructed density field (delta, stored in the
// texture's alpha channel). Positive delta = overdense (structures); voids clamp to 0.
fn overdensity(p: vec3<f32>) -> f32 {
  return clamp(textureSampleLevel(velTex, velSamp, p, 0.0).w * DENS_SCALE, 0.0, 1.0);
}

// Rejection-sample a spawn position. bias 0 -> uniform; 1 -> accept probability == the
// overdensity weight, so particles concentrate on structures and voids stay clear.
// Falls back to the densest candidate tried, so it always returns a point.
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

// ADVECT — particles physically drift through the field and each trail is a genuine
// PATHLINE: the ring of the particle's real recent positions (index TRAIL-1 = newest/
// head, 0 = oldest/tail). Because the trail is real history rather than an upstream
// streamline recomputed from a moving anchor, it can never sweep across space or spike
// past the box edge. The head advances a CONTINUOUS distance per frame (headStep), so
// motion can be arbitrarily slow; a new ring point is committed every trailStep of
// travel via the carried-distance accumulator, keeping the pathline arc-length-spaced
// and curvature-accurate even when one frame crosses several boundaries. Two fully
// decoupled knobs: flowSpeed -> headStep (speed), trail -> trailStep (length = TRAIL*step).
@compute @workgroup_size(64)
fn advect(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= prm.n) { return; }
  let base = i * TRAIL;

  // (Re)seed: pick a fresh density-weighted spawn point, stagger its age so deaths don't
  // sync, and collapse the whole pathline onto it so no stale streak spans from elsewhere.
  if (prm.seedFlag == 1u) {
    let sb = randomStream(i);
    let spawn = pickSpawn(sb, prm.bias);
    let spawnVel = textureSampleLevel(velTex, velSamp, spawn, 0.0);
    for (var k: u32 = 0u; k < TRAIL; k = k + 1u) { trail[base + k] = vec4<f32>(spawn, length(spawnVel.xyz)); }
    parts[i] = vec4<f32>(spawn, rand01(sb + AGE_SALT) * LIFE);
    acc[i] = 0.0;
    return;
  }

  var head = parts[i].xyz;
  let age = parts[i].w + prm.dt;
  var carried = acc[i];
  var toGo = min(prm.headStep, prm.trailStep * f32(TRAIL));   // bound the inner loop
  var rs = randomStream(i) + WANDER_SALT;                     // per-step jitter stream

  // march the head forward 'toGo', in steps no larger than the gap to the next ring
  // boundary, sampling along the way so curvature is followed and spacing stays uniform
  loop {
    let step = min(toGo, prm.trailStep - carried);
    let vel = textureSampleLevel(velTex, velSamp, head, 0.0);
    // perturb the flow direction by a small random vector so particles don't all trace the
    // same deterministic path (and pile into the same bright orbits); wander 0 = pure flow
    let jitter = vec3<f32>(rand01(rs) - 0.5, rand01(rs + 1u) - 0.5, rand01(rs + 2u) - 0.5);
    rs = rs + 3u;
    let dir = normalize(normalize(vel.xyz + DIR_EPS) + jitter * prm.wander);
    head = head + dir * step;
    carried = carried + step;
    toGo = toGo - step;
    if (!insideBox(head) || age > LIFE) {                 // left the box or aged out -> respawn
      let spawn = pickSpawn(randomStream(i), prm.bias);     // density-weighted respawn too
      let spawnVel = textureSampleLevel(velTex, velSamp, spawn, 0.0);
      for (var k: u32 = 0u; k < TRAIL; k = k + 1u) { trail[base + k] = vec4<f32>(spawn, length(spawnVel.xyz)); }
      parts[i] = vec4<f32>(spawn, 0.0);
      acc[i] = 0.0;
      return;
    }
    if (carried >= prm.trailStep) {                   // crossed a boundary: commit a ring point
      carried = carried - prm.trailStep;
      for (var k: u32 = 0u; k < TRAIL - 1u; k = k + 1u) { trail[base + k] = trail[base + k + 1u]; }
      trail[base + TRAIL - 1u] = vec4<f32>(head, length(vel.xyz));
    }
    if (toGo <= MIN_TRAVEL) { break; }
  }
  // newest slot tracks the continuous head (covers the sub-boundary remainder)
  let headVel = textureSampleLevel(velTex, velSamp, head, 0.0);
  trail[base + TRAIL - 1u] = vec4<f32>(head, length(headVel.xyz));
  parts[i] = vec4<f32>(head, age);
  acc[i] = carried;
}

// STREAMLINES — the seed is FIXED, so the integrated curve is stationary and motion
// is a pulse travelling along it (render pass). The line is CENTRED on the seed: the
// middle index sits at the seed, the lower half walks upstream and the upper half
// downstream. Centring keeps the streamline mass straddling the seed distribution (the
// same anchor advect uses) instead of hanging entirely upstream, so the two modes line
// up. Pin at the box boundary so the edge-clamped sampler can't fling a line to infinity.
@compute @workgroup_size(64)
fn streamline(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= prm.n) { return; }
  let base = i * TRAIL;
  // (Re)seed the fixed anchor at a density-weighted point, then integrate from it
  if (prm.seedFlag == 1u) {
    let sb = randomStream(i);
    parts[i] = vec4<f32>(pickSpawn(sb, prm.bias), rand01(sb + AGE_SALT) * LIFE);
  }
  let seed = parts[i].xyz;
  let mid: i32 = i32(TRAIL) / 2;
  trail[base + u32(mid)] = vec4<f32>(seed, length(textureSampleLevel(velTex, velSamp, seed, 0.0).xyz));
  // lower half: walk -v from the seed into indices mid-1 .. 0
  var walk = seed;
  for (var k: i32 = mid - 1; k >= 0; k = k - 1) {
    let vel = textureSampleLevel(velTex, velSamp, walk, 0.0);
    let next = walk - normalize(vel.xyz + DIR_EPS) * prm.trailStep;
    if (insideBox(next)) { walk = next; }
    trail[base + u32(k)] = vec4<f32>(walk, length(textureSampleLevel(velTex, velSamp, walk, 0.0).xyz));
  }
  // upper half: walk +v from the seed into indices mid+1 .. TRAIL-1
  walk = seed;
  for (var k: i32 = mid + 1; k < i32(TRAIL); k = k + 1) {
    let vel = textureSampleLevel(velTex, velSamp, walk, 0.0);
    let next = walk + normalize(vel.xyz + DIR_EPS) * prm.trailStep;
    if (insideBox(next)) { walk = next; }
    trail[base + u32(k)] = vec4<f32>(walk, length(textureSampleLevel(velTex, velSamp, walk, 0.0).xyz));
  }
}`;
