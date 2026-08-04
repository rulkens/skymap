// milkyWay/sfMap/sfMapStep.wesl — one generation of the SSPSF cellular
// automaton (Gerola & Seiden 1978, ApJ 223, 129) on a fixed log-polar grid.
// State (gas, age, refractory timer, an old-activity EMA) ping-pongs between
// two storage textures; rebuildSfMap dispatches one 'cs' per step, in ONE
// compute pass, never per frame. MATERIAL (Lagrangian) frame: a cell's state
// lives at its own texel forever, never resampled (see selfState below) —
// only the neighbour lookup and arm-forcing sample drift with shear.
// sfMapPack.wesl un-shears back to world coordinates once, at the end. Grid
// is UNIFORM log-polar (768 az x 256 ring), not Gerola & Seiden's own
// equal-area cells.

import package::milkyWay::sfMap::sfMapShear::sfMapShearTexels;

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
  armFluxRef: f32,
  // 'oldActivity' trace decay/gain — see GalaxySfMapParams.ts for the
  // steady-state derivation; formerly baked-in consts, now sliders.
  activityDecay: f32,
  activityGain: f32,
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

// Thin wrapper over the shared module: sfMapPack.wesl's un-shear imports the
// SAME function, so the two passes cannot silently disagree on what a
// texel of shear means. ringCount/azCount come from textureDimensions(nextTex)
// in cs() below — the grid size lives ONLY in the texture, never a WGSL
// const (sfMapShear.wesl's own precedent: params, not baked in).
fn shearTexels(ring: u32, ringCount: u32, azCount: u32) -> f32 {
  return sfMapShearTexels(ring, ringCount, azCount, u.rMin, u.rMax, u.corotationRadius, u.shearRate);
}

fn wrapAz(azF: f32, azCount: u32) -> f32 {
  return (azF % f32(azCount) + f32(azCount)) % f32(azCount);
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

// Bilinear-in-azimuth read of armForcingTex. Bilinear is correct and
// desirable here: the field is SMOOTH and WORLD-frame-static, so blurring it
// is harmless — unlike blurring the discrete ignition state (neighbourAt,
// below), which is exactly what a per-generation resample used to destroy.
// Do not 'fix' one of these two to match the other; the asymmetry is the point.
fn armForcingAt(ring: u32, azF: f32, azCount: u32) -> f32 {
  let wrapped = wrapAz(azF, azCount);
  let a0 = u32(floor(wrapped)) % azCount;
  let a1 = (a0 + 1u) % azCount;
  let frac = wrapped - floor(wrapped);
  let c0 = textureLoad(armForcingTex, vec2<i32>(i32(a0), i32(ring)), 0).x;
  let c1 = textureLoad(armForcingTex, vec2<i32>(i32(a1), i32(ring)), 0).x;
  return mix(c0, c1, frac);
}

// Exact texel read of a NEIGHBOUR, rounded to the nearest whole texel — no
// bilinear blend of the (unbounded) age channel, which is what let a lone
// ignited cell go invisible to its neighbours before (research doc).
fn neighbourAt(nRing: u32, azF: f32, azCount: u32) -> vec4<f32> {
  let a = u32(round(wrapAz(azF, azCount))) % azCount;
  return textureLoad(prevTex, vec2<i32>(i32(a), i32(nRing)), 0);
}

@compute @workgroup_size(16, 16)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(nextTex);
  if (any(gid.xy >= dims)) {
    return;
  }
  let az = gid.x;
  let ring = gid.y;
  let azCount = dims.x;
  let ringCount = dims.y;
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

  // MATERIAL FRAME: this texel's own state never moves (Gerola & Seiden
  // never resample — see this file's header). No shear, no blend.
  let selfState = textureLoad(prevTex, vec2<i32>(i32(az), i32(ring)), 0);
  let gas = selfState.x;
  let age = selfState.y;
  let refractory = selfState.z;
  let oldActivity = selfState.w;

  // Moore (8-cell) neighbourhood, but adjacency is now a WORLD-frame
  // relation: solving nextTex[x] = prevTex[x - shear] (the OLD Eulerian
  // recursion this file used to run) for one tracked parcel's trajectory
  // gives worldAz(materialAz, genStep) = materialAz + shear(ring) * genStep
  // — a material cell drifts to increasingly higher world azimuth as
  // genStep grows, at its own ring's shear rate. Two texels (ring, az) and
  // (nRing, j) are WORLD-adjacent (offset da) when worldAz(nRing, j) ==
  // worldAz(ring, az) + da; solving for j:
  //   j = az + da + (shearTexels(ring) - shearTexels(nRing)) * genStep
  // The offset ACCUMULATES with genStep, which is what makes the neighbour
  // set evolve over time — the paper's actual mechanism (research doc §19).
  var ignitedNeighbours = 0.0;
  let shearAtRing = shearTexels(ring, ringCount, azCount);
  for (var dr = -1; dr <= 1; dr++) {
    let nRingI = i32(ring) + dr;
    if (nRingI < 0 || nRingI >= i32(ringCount)) {
      continue;
    }
    let nRing = u32(nRingI);
    let relShear = (shearAtRing - shearTexels(nRing, ringCount, azCount)) * f32(genStep);
    for (var da = -1; da <= 1; da++) {
      if (dr == 0 && da == 0) {
        continue;
      }
      // Exact equality is valid again (neighbourAt's own docstring).
      let neighbour = neighbourAt(nRing, f32(i32(az) + da) + relShear, azCount);
      if (neighbour.y == 0.0) {
        ignitedNeighbours += 1.0;
      }
    }
  }

  // Arm forcing is WORLD-frame and static; this material cell has drifted to
  // world azimuth az + shearTexels(ring) * genStep (derived above), so
  // that's where the forcing field must be sampled — not at its own texel.
  let armF = armForcingAt(ring, f32(az) + shearAtRing * f32(genStep), azCount);
  // The raw forcing term rewards RESIDENCE TIME, not FLUX through the
  // ridge: away from corotation material shears through in a few steps, but
  // at corotation it sits there and rolls ignition every step, diverging as
  // 1/|shear| — the corotation ring (research doc). No relative motion means
  // no shock, so weighting by |shear|/armFluxRef cancels that 1/|shear| and
  // sends corotation to a DEFICIT instead — a DERIVATION from the shear
  // term's own premise, not citation-checked. armFluxRef is a tunable: a
  // hard clamp at 1 texel/step would make the deficit band far too wide.
  let armFactor = armF * saturate(abs(shearAtRing) / u.armFluxRef);
  // Gas multiplies the raw percolation probability rather than gating it
  // with a threshold: the params contract carries no separate gas-floor
  // knob, and a continuous multiplier degrades smoothly as gas depletes
  // instead of cutting off at an arbitrary line.
  let p = (u.baseIgnition + u.spread * ignitedNeighbours + u.armForcing * armFactor) * gas;
  let roll = cellHash(ring, az, genStep, u32(round(u.seed)));
  let ignite = refractory <= 0.0 && roll < p;

  var next: vec4<f32>;
  if (ignite) {
    next = vec4<f32>(
      0.0,
      0.0,
      u.refractorySteps,
      oldActivity * u.activityDecay + u.activityGain,
    );
  } else {
    next = vec4<f32>(
      min(1.0, gas + u.gasRegen),
      age + 1.0,
      max(0.0, refractory - 1.0),
      oldActivity * u.activityDecay,
    );
  }
  textureStore(nextTex, vec2<i32>(i32(az), i32(ring)), next);
}
