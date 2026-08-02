// milkyWayField/sfMapStep.wesl — one generation of the SSPSF cellular
// automaton (Gerola & Seiden 1978, ApJ 223, 129) on a fixed log-polar grid.
// State (gas, age-since-ignition, refractory timer, an old-activity EMA) is
// ping-ponged between two storage textures; createGalaxyEngine.ts's
// rebuildSfMap dispatches one 'cs' invocation of this per step, all in ONE
// compute pass, never per frame. See research doc §19 before changing the
// step rule or the shear term.
//
// Grid is UNIFORM log-polar (512 az x 256 ring) — a step-1 simplification.
// Gerola & Seiden's own rings are subdivided into EQUAL-AREA cells (cell
// count growing with radius), which this grid does not attempt.

const AZ: u32 = 512u;
const RINGS: u32 = 256u;
const PI: f32 = 3.14159265358979;

// The trailing 'old activity' wake's own decay/gain — a look pair, tuned by
// eye, distinct from the percolation parameters the params contract exposes
// as sliders (baseIgnition/spread/...).
const OLD_ACTIVITY_DECAY: f32 = 0.985;
const OLD_ACTIVITY_GAIN: f32 = 0.35;

struct SfMapConstants {
  rMin: f32,
  rMax: f32,
  corotationRadius: f32,
  shearRate: f32,
  baseIgnition: f32,
  spread: f32,
  armForcing: f32,
  gasRegen: f32,
  refractorySteps: f32,
  seed: f32,
}

// A single scalar, but its own struct/binding: it is the one uniform that
// varies per dispatch, given a STATIC (non-dynamic) offset into a buffer
// holding every step's index — rebuildSfMap writes that buffer ONCE, before
// any dispatch, and binds a fresh bind group per step rather than rewriting
// one shared location N times (which queue-ordering would collapse to the
// LAST step's value for every dispatch — see rebuildSfMap's own comment).
struct SfMapStepIndex {
  step: f32,
}

@group(0) @binding(0) var<uniform> u: SfMapConstants;
@group(0) @binding(1) var armForcingTex: texture_2d<f32>;
@group(0) @binding(2) var prevTex: texture_2d<f32>;
@group(0) @binding(3) var nextTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var<uniform> stepIdx: SfMapStepIndex;

// Log-radial ring -> physical radius. Restated from
// galaxySfMapArmForcing.ts's sfMapRingRadius (WGSL cannot import TS) — the
// two MUST agree on what texel (ring, az) means, or the baked arm-forcing
// texture silently misaligns with the automaton it drives.
fn ringRadius(ring: u32) -> f32 {
  let t = f32(ring) / f32(RINGS - 1u);
  return u.rMin * pow(u.rMax / u.rMin, t);
}

// integerHash4 — same Jenkins/Squirrel-family avalanche as
// dustNoiseBake.wesl's integerHash3, one more term for the step. Keyed on
// (cell, step, seed) only, per the params contract: no time or frame input,
// so a rebuild of the same galaxy always reproduces the same map.
fn cellHash(ring: u32, az: u32, genStep: u32, seed: u32) -> f32 {
  var h = ring * 374761393u + az * 668265263u + genStep * 2246822519u + seed * 3266489917u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return f32(h ^ (h >> 16u)) / 4294967295.0;
}

// Bilinear-in-azimuth read of the PREVIOUS state at a fractional texel
// column, wrapping — this IS the shear: 'theta - dTheta(r)' as a per-row
// angular offset, sub-texel so the sheared structure doesn't stair-step
// (research doc §19).
fn sampleSheared(ring: u32, azF: f32) -> vec4<f32> {
  let wrapped = (azF % f32(AZ) + f32(AZ)) % f32(AZ);
  let a0 = u32(floor(wrapped)) % AZ;
  let a1 = (a0 + 1u) % AZ;
  let frac = wrapped - floor(wrapped);
  let c0 = textureLoad(prevTex, vec2<i32>(i32(a0), i32(ring)), 0);
  let c1 = textureLoad(prevTex, vec2<i32>(i32(a1), i32(ring)), 0);
  return mix(c0, c1, frac);
}

// This ring's own per-step angular shear, in TEXELS (the params contract
// states shearRate/corotationRadius in radians). Omega(r) - Omega_pattern,
// NOT bare Omega — zero at corotation, opposite sign either side of it. See
// this file's header.
fn shearTexels(ring: u32) -> f32 {
  let r = max(ringRadius(ring), 1e-4);
  let dTheta = (1.0 / r - 1.0 / u.corotationRadius) * u.shearRate;
  return dTheta * f32(AZ) / (2.0 * PI);
}

@compute @workgroup_size(16, 16)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(nextTex);
  if (any(gid.xy >= dims)) {
    return;
  }
  let az = gid.x;
  let ring = gid.y;
  // Named genStep, not 'step': WGSL predeclares a builtin 'step()' function,
  // and a local binding is free to shadow it, but there is no reason to
  // court that ambiguity in a linker this project has already found landmines in.
  let genStep = u32(stepIdx.step);

  // Step 0 has no meaningful previous state — prevTex is whatever the OTHER
  // ping-pong texture last held (possibly a prior generation's stale
  // content) — so it is seeded here instead of standing up a separate init
  // pass. Full gas, age far past any decay window, no refractory lock.
  if (genStep == 0u) {
    textureStore(nextTex, vec2<i32>(i32(az), i32(ring)), vec4<f32>(1.0, 1.0e4, 0.0, 0.0));
    return;
  }

  let selfShear = shearTexels(ring);
  let selfState = sampleSheared(ring, f32(az) - selfShear);
  let gas = selfState.x;
  let age = selfState.y;
  let refractory = selfState.z;
  let oldActivity = selfState.w;

  // Moore (8-cell) neighbourhood — the uniform grid's stand-in for Gerola &
  // Seiden's ring-adjacency on their equal-area cells (this file's header).
  // A neighbour counts as 'ignited' if IT just ignited last generation
  // (age == 0 after its own shear-advected read), which is the standard
  // percolation trigger: this generation's fire spreads from last
  // generation's.
  var ignitedNeighbours = 0.0;
  for (var dr = -1; dr <= 1; dr++) {
    let nRingI = i32(ring) + dr;
    if (nRingI < 0 || nRingI >= i32(RINGS)) {
      continue;
    }
    let nRing = u32(nRingI);
    let nShear = shearTexels(nRing);
    for (var da = -1; da <= 1; da++) {
      if (dr == 0 && da == 0) {
        continue;
      }
      let neighbour = sampleSheared(nRing, f32(i32(az) + da) - nShear);
      // THRESHOLD, never 'age == 0.0': sampleSheared returns a bilinear BLEND
      // of two texels, so an exact-zero test fires only when BOTH source
      // texels ignited last generation — one ignited cell is invisible to its
      // neighbours and percolation never starts. That bug cost a factor of
      // three in the spread threshold (0.56 vs the classical ~0.18) and
      // presented as a dead knob everywhere except the corotation ring, where
      // the shear offset is exactly zero and the blend degenerates.
      // 0.5 is one generation's age increment, so anything blended from a
      // just-ignited cell still counts, weighted by how much of it is there.
      if (neighbour.y < 0.5) {
        ignitedNeighbours += 1.0;
      }
    }
  }

  let armF = textureLoad(armForcingTex, vec2<i32>(i32(az), i32(ring)), 0).x;
  // Gas multiplies the raw percolation probability rather than gating it
  // with a threshold: the params contract carries no separate gas-floor
  // knob, and a continuous multiplier degrades smoothly as gas depletes
  // instead of cutting off at an arbitrary line.
  let p = (u.baseIgnition + u.spread * ignitedNeighbours + u.armForcing * armF) * gas;
  let roll = cellHash(ring, az, genStep, u32(round(u.seed)));
  let ignite = refractory <= 0.0 && roll < p;

  var next: vec4<f32>;
  if (ignite) {
    next = vec4<f32>(
      0.0,
      0.0,
      u.refractorySteps,
      oldActivity * OLD_ACTIVITY_DECAY + OLD_ACTIVITY_GAIN,
    );
  } else {
    next = vec4<f32>(
      min(1.0, gas + u.gasRegen),
      age + 1.0,
      max(0.0, refractory - 1.0),
      oldActivity * OLD_ACTIVITY_DECAY,
    );
  }
  textureStore(nextTex, vec2<i32>(i32(az), i32(ring)), next);
}
