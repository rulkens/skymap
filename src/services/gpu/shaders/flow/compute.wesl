// flow/compute.wesl — particle integration for the cosmic-flow field.
//
// Integrates tracer particles through the 3D velocity texture 'velTex' (the
// CF4++ peculiar-velocity field in the unit cube [0,1]^3). Two modes share one
// buffer layout:
//   - advect (mode 0): a Lagrangian pathline. Each particle marches forward
//     along the local flow per frame, trailing a fading ring buffer behind the
//     head, and respawns when it leaves the box or out-lives 'LIFE'. A
//     per-particle 'acc' carries sub-trailStep distance between frames so trail
//     samples land at even arc length despite a variable per-frame headStep.
//   - streamline (mode 1): an Eulerian snapshot. Each frame the whole trail is
//     re-derived by walking the field forward and backward from the seed point;
//     no state carries between frames.
//
// 'seed' is a one-shot kernel dispatched at construction and on reseed; the two
// integrators are pure steady-frame kernels. One shared 'seed' serves both
// modes — it does the advect-style full seed (density-weighted spawn, staggered
// age, trail-ring collapse onto the spawn point, acc reset), a strict superset
// of what streamline needs (which re-derives its trail anyway).
//
// 'acc' @binding(5) is advect-only state but stays declared for all three
// pipelines so they share one explicit bind-group layout; WGSL permits an unused
// module-scope binding.
//
// The velocity texture's alpha does double duty: spawn-bias density delta (via
// 'overdensity' in lib/flow.wesl) and, as length(vel.xyz), the per-sample speed
// the trail stores for the colour ramp.

import package::flow::constants::TRAIL;
import package::flow::constants::LIFE;
import package::flow::constants::DENS_SCALE;
import package::lib::flow::rand01;
import package::lib::flow::randomStream;
import package::lib::flow::insideBox;
import package::lib::flow::pickSpawn;
import package::lib::flow::AGE_SALT;
import package::lib::flow::WANDER_SALT;

// Integration epsilons, local to the kernels: DIR_EPS keeps a zero velocity
// from NaN-ing the direction normalize; MIN_TRAVEL ends the march loop.
const DIR_EPS = vec3<f32>(1e-6);
const MIN_TRAVEL: f32 = 1e-9;

// Per-dispatch integration parameters (48 bytes; TS pads the tail):
//   dt        f32 @ 0    seconds elapsed since the previous frame (ages the particle)
//   trailStep f32 @ 4
//   headStep  f32 @ 8    grid units to march THIS frame — the CPU has already
//                        multiplied the per-second speed by dt
//   n         u32 @ 12   active particle count
//   frame     u32 @ 16   frame counter / RNG salt
//   mode      u32 @ 20   advect=0 / streamline=1
//   bias      f32 @ 24   density-weighting strength for spawn
//   wander    f32 @ 28   jitter magnitude
struct IntegratorParams {
  dt: f32,
  trailStep: f32,
  headStep: f32,
  n: u32,
  frame: u32,
  mode: u32,
  bias: f32,
  wander: f32,
};

@group(0) @binding(0) var<storage, read_write> parts: array<vec4<f32>>;   // xyz = position, w = age
@group(0) @binding(1) var velTex: texture_3d<f32>;                        // rgb = velocity, a = speed / overdensity
@group(0) @binding(2) var velSamp: sampler;
@group(0) @binding(3) var<uniform> params: IntegratorParams;
@group(0) @binding(4) var<storage, read_write> trail: array<vec4<f32>>;   // ring of (xyz, speed) per particle
@group(0) @binding(5) var<storage, read_write> acc: array<f32>;           // advect only; bound for all three

// ── seed ───────────────────────────────────────────────────────────────
//
// One-time (and on-reseed) initializer shared by both modes: density-weighted
// spawn, staggered age, trail-ring collapse onto the spawn point, acc reset.
@compute @workgroup_size(64)
fn seed(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.n) { return; }
  let base = i * TRAIL;
  let sb = randomStream(i, params.frame);
  let spawn = pickSpawn(velTex, velSamp, DENS_SCALE, sb, params.bias);
  let spawnVel = textureSampleLevel(velTex, velSamp, spawn, 0.0);
  for (var k: u32 = 0u; k < TRAIL; k = k + 1u) { trail[base + k] = vec4<f32>(spawn, length(spawnVel.xyz)); }
  parts[i] = vec4<f32>(spawn, rand01(sb + AGE_SALT) * LIFE);
  acc[i] = 0.0;
}

// ── advect ─────────────────────────────────────────────────────────────
@compute @workgroup_size(64)
fn advect(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.n) { return; }
  let base = i * TRAIL;

  var head = parts[i].xyz;
  let age = parts[i].w + params.dt;
  var carried = acc[i];
  var toGo = min(params.headStep, params.trailStep * f32(TRAIL));
  var rs = randomStream(i, params.frame) + WANDER_SALT;

  loop {
    let step = min(toGo, params.trailStep - carried);
    let vel = textureSampleLevel(velTex, velSamp, head, 0.0);
    let jitter = vec3<f32>(rand01(rs) - 0.5, rand01(rs + 1u) - 0.5, rand01(rs + 2u) - 0.5);
    rs = rs + 3u;
    let dir = normalize(normalize(vel.xyz + DIR_EPS) + jitter * params.wander);
    head = head + dir * step;
    carried = carried + step;
    toGo = toGo - step;
    if (!insideBox(head) || age > LIFE) {
      let spawn = pickSpawn(velTex, velSamp, DENS_SCALE, randomStream(i, params.frame), params.bias);
      let spawnVel = textureSampleLevel(velTex, velSamp, spawn, 0.0);
      for (var k: u32 = 0u; k < TRAIL; k = k + 1u) { trail[base + k] = vec4<f32>(spawn, length(spawnVel.xyz)); }
      parts[i] = vec4<f32>(spawn, 0.0);
      acc[i] = 0.0;
      return;
    }
    if (carried >= params.trailStep) {
      carried = carried - params.trailStep;
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

// ── streamline ─────────────────────────────────────────────────────────
@compute @workgroup_size(64)
fn streamline(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.n) { return; }
  let base = i * TRAIL;
  let seedPos = parts[i].xyz;
  let mid: i32 = i32(TRAIL) / 2;
  trail[base + u32(mid)] = vec4<f32>(seedPos, length(textureSampleLevel(velTex, velSamp, seedPos, 0.0).xyz));
  var walk = seedPos;
  for (var k: i32 = mid - 1; k >= 0; k = k - 1) {
    let vel = textureSampleLevel(velTex, velSamp, walk, 0.0);
    let next = walk - normalize(vel.xyz + DIR_EPS) * params.trailStep;
    if (insideBox(next)) { walk = next; }
    trail[base + u32(k)] = vec4<f32>(walk, length(textureSampleLevel(velTex, velSamp, walk, 0.0).xyz));
  }
  walk = seedPos;
  for (var k: i32 = mid + 1; k < i32(TRAIL); k = k + 1) {
    let vel = textureSampleLevel(velTex, velSamp, walk, 0.0);
    let next = walk + normalize(vel.xyz + DIR_EPS) * params.trailStep;
    if (insideBox(next)) { walk = next; }
    trail[base + u32(k)] = vec4<f32>(walk, length(textureSampleLevel(velTex, velSamp, walk, 0.0).xyz));
  }
}
