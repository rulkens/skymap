// milkyWay/ismMap/ismMapFluidVelocity.wesl — Pass A of the fluid ISM-map step:
// composes the velocity field ONCE per texel (shear + curl noise + event
// impulses + arm-gather) and writes it to velocityTex for
// ismMapFluidStep.wesl (Pass B) to advect and difference. Used to be
// evaluated 5x per texel per step (self + 4 neighbours) in Pass B's old
// divergence estimate; this turns that into 1 evaluation + 4 textureLoads.
// Events are also tile-culled: each 16x16 workgroup builds a SHARED list of
// only the events whose kernel can reach this tile, so the per-texel loop
// walks a handful of events, not the whole active window. See
// ismMapFluidStep.wesl's header for the shared integration scheme.

import package::lib::util::hash21;
import package::milkyWay::ismMap::ismMapShear::ismMapShearTexels;
import package::milkyWay::ismMap::ismMapShear::wrapAz;

struct IsmMapFluidConstants {
  rMin: f32,
  rMax: f32,
  corotationRadius: f32,
  shearStrength: f32,
  gasRegen: f32,
  emaRate: f32,
  curlStrength: f32,
  curlScale: f32,
  impulseDuration: f32,
  armGather: f32,
  // Unused here — this pass composes velocity only. Consumed by
  // ismMapFluidStep.wesl (Pass B) as a density-diffusion coefficient. Kept so
  // the shared fields stay a byte-identical PREFIX of Pass B's longer copy
  // (packIsmMapFluidConstants.ts is the offset authority; Pass B's trailing
  // starsDeposit/starsDecay are deliberately absent here — a shorter struct
  // binds validly, and the prefix contract is what the parity test pins).
  diffusion: f32,
  // Shear drag by the arm-forcing field at this texel — see composedVelocity
  // below. Forcing peaks at 1 (galaxyIsmMapArmForcing.ts's clamp), so full
  // stall at a ridge crest needs armDrag >= 1.
  armDrag: f32,
  // Pass-B-consumed only (ismMapFluidStep.wesl's gasProfile) — kept for the
  // shared-prefix layout, same discipline as diffusion above.
  gasScaleLength: f32,
  // Pass-B-consumed only — see gasScaleLength above.
  gasFloor: f32,
  // Directional gate on armGather below (composedVelocity) — full strength
  // where the drift carries gas toward the ridge (upstream flank), scaled by
  // (1 - laneBias) on the downstream flank, so the gather can't wash out the
  // one-sided lane armDrag creates. 0 (default) is today's symmetric gather,
  // bit-identical.
  laneBias: f32,
  // Signed az-texel offset of armGather's OWN forcing sample (composedVelocity
  // below) — see the sign-convention comment there. 0 (default) samples the
  // crest texel itself, bit-identical to today.
  gatherOffset: f32,
}

// Same layout as ismMapFluidStep.wesl's own copy (packIsmMapFluidStepIndex.ts
// is the offset authority) — this pass reads all three fields, Pass B now
// only reads '.step'.
struct IsmMapFluidStepIndex {
  step: f32,
  activeStart: f32,
  activeEnd: f32,
}

const PI: f32 = 3.14159265358979;
// Radial growth exponent for an active event's kernel — see
// ismMapFluidStep.wesl's own IMPULSE_GROWTH_EXPONENT for the rationale (this
// is the same look constant, duplicated because the event kernel math now
// lives entirely in this file).
const IMPULSE_GROWTH_EXPONENT: f32 = 0.6;
const EVENT_STRIDE: u32 = 8u;
const CURL_PHASE_SPEED: f32 = 0.03;
const CURL_FD_EPS: f32 = 0.5;
const ARM_GATHER_SAT: f32 = 3.0;
// exp(-0.5 * x^2) = 1e-4  =>  x = sqrt(2 * ln(1e4)) =~ 4.29 — the same
// falloff cutoff ismMapFluidStep.wesl's old per-texel loop used implicitly
// ('falloff > 1e-4'), made explicit here so the tile cull can bound an
// event's reach without evaluating the falloff at every texel first.
const CUTOFF_SIGMA_MULT: f32 = 4.3;
// Cull-test margin, in ring-unit texels — absorbs the gap between "nearest
// point on the tile's bounding box" and "nearest texel centre", plus fp
// slop. A false positive here only costs one extra event in the shared
// list; a false negative would visibly clip a kernel, so this errs wide.
const TILE_CULL_MARGIN: f32 = 2.0;
// Comfortably above the ~75-event active window the current tuning
// produces (ISM_MAP_FLUID_MAX_EVENTS's own budget) — can only bind if
// tuning changes to pack far more simultaneous events into one tile's
// reach. Overflow silently drops the excess event, same "truncate, don't
// resample" contract as ISM_MAP_FLUID_MAX_EVENTS.
const TILE_EVENT_CAP: u32 = 128u;

@group(0) @binding(0) var<uniform> u: IsmMapFluidConstants;
@group(0) @binding(1) var prevTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> stepIdx: IsmMapFluidStepIndex;
@group(0) @binding(3) var<storage, read> events: array<f32>;
@group(0) @binding(4) var armForcingTex: texture_2d<f32>;
@group(0) @binding(5) var velocityTex: texture_storage_2d<rgba16float, write>;

var<workgroup> sharedEventIdx: array<u32, TILE_EVENT_CAP>;
var<workgroup> sharedEventCount: atomic<u32>;

// Non-negative wrap of a lattice x-coordinate into [0, period) — period is
// an INTEGER so the corner hashed at x=period-1+1=period is the same corner
// hashed at x=0 (see valueNoiseRaw below); this is what makes the noise
// seamless across the az wrap.
fn wrapLatticeX(x: f32, period: f32) -> f32 {
  return x - period * floor(x / period);
}

// Diverged from ismMapFluidStep.wesl's history (see git log) by the addition
// of xPeriod: wraps both lattice corners' x BEFORE hashing so x and
// x + xPeriod hash identically. y is left unwrapped — the ring axis never
// wraps.
fn valueNoiseRaw(p: vec2<f32>, xPeriod: f32) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let x0 = wrapLatticeX(i.x, xPeriod);
  let x1 = wrapLatticeX(i.x + 1.0, xPeriod);
  let a = hash21(vec2<f32>(x0, i.y));
  let b = hash21(vec2<f32>(x1, i.y));
  let c = hash21(vec2<f32>(x0, i.y + 1.0));
  let d = hash21(vec2<f32>(x1, i.y + 1.0));
  let s = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}

// Doubling frequency per octave must double xPeriod alongside it — an
// octave's lattice runs at freq*p, so its wrap period scales the same way.
fn fbm2(p: vec2<f32>, xPeriod: f32) -> f32 {
  var v = 0.0;
  var amp = 0.5;
  var freq = 1.0;
  var period = xPeriod;
  for (var i = 0; i < 3; i++) {
    v += amp * valueNoiseRaw(p * freq, period);
    freq *= 2.0;
    period *= 2.0;
    amp *= 0.5;
  }
  return v;
}

// Divergence-free by construction: v = (dPsi/dy, -dPsi/dx) for a scalar
// potential Psi. gridPos is already metric-corrected by the caller.
//
// x is quantized to an integer lattice period (azPeriod) because only an
// integer period wraps seamlessly through valueNoiseRaw's hashing — az is
// periodic (this IS the wrap seam). y keeps curlScale unquantized because
// ring never wraps, so there's no seam to protect there. The quantization
// snaps the effective az frequency by <1% at current defaults.
fn curlVelocity(gridPos: vec2<f32>, azCount: u32, curlScale: f32, genStep: f32) -> vec2<f32> {
  let azCountF = f32(azCount);
  let azPeriod = max(1.0, round(azCountF * curlScale));
  let xScale = azPeriod / azCountF;
  let p = vec2<f32>(gridPos.x * xScale, gridPos.y * curlScale) + vec2<f32>(genStep * CURL_PHASE_SPEED, 0.0);
  let n1 = fbm2(p + vec2<f32>(0.0, CURL_FD_EPS), azPeriod);
  let n2 = fbm2(p - vec2<f32>(0.0, CURL_FD_EPS), azPeriod);
  let n3 = fbm2(p + vec2<f32>(CURL_FD_EPS, 0.0), azPeriod);
  let n4 = fbm2(p - vec2<f32>(CURL_FD_EPS, 0.0), azPeriod);
  let dPsiDy = (n1 - n2) / (2.0 * CURL_FD_EPS);
  let dPsiDx = (n3 - n4) / (2.0 * CURL_FD_EPS);
  return vec2<f32>(dPsiDy, -dPsiDx);
}

fn armForcingAt(az: i32, ring: i32, azCount: i32, ringCount: i32) -> f32 {
  let a = wrapAz(az, azCount);
  let r = clamp(ring, 0, ringCount - 1);
  return textureLoad(armForcingTex, vec2<i32>(a, r), 0).x;
}

// Steepest-ascent direction of the arm-forcing field — see
// ismMapFluidStep.wesl's original for the azToRingMetric rationale (verbatim
// here, that file no longer needs its own copy).
fn forcingGradient(az: i32, ring: i32, azCount: i32, ringCount: i32, azToRingMetric: f32) -> vec2<f32> {
  let fAzPlus = armForcingAt(az + 1, ring, azCount, ringCount);
  let fAzMinus = armForcingAt(az - 1, ring, azCount, ringCount);
  let fRingPlus = armForcingAt(az, ring + 1, azCount, ringCount);
  let fRingMinus = armForcingAt(az, ring - 1, azCount, ringCount);
  let dFdAz = (fAzPlus - fAzMinus) * 0.5;
  let dFdRing = (fRingPlus - fRingMinus) * 0.5;
  return vec2<f32>(dFdAz, dFdRing * azToRingMetric);
}

struct VelocitySample {
  vel: vec2<f32>,
  // Dimensionless [0,1] "how present is an event here" — Pass B's eventAge-
  // reset and activity EMA both key off this, not off speed.
  eventStamp: f32,
}

// The composed velocity at this invocation's OWN texel, walking only the
// events the cull loop below placed in 'sharedEventIdx' (module-scope
// workgroup storage, readable from any function in this shader stage) —
// 'cullCount' bounds how many of that array's slots are live.
fn composedVelocity(
  az: i32,
  ring: i32,
  azCount: u32,
  ringCount: u32,
  azToRingMetric: f32,
  genStep: u32,
  cullCount: u32,
) -> VelocitySample {
  let azCountI = i32(azCount);
  let ringCountI = i32(ringCount);
  let localDust = textureLoad(prevTex, vec2<i32>(az, ring), 0).w;

  let shearVelAz = ismMapShearTexels(u32(ring), ringCount, azCount, u.rMin, u.rMax, u.corotationRadius, u.shearStrength);
  let curl = curlVelocity(vec2<f32>(f32(az), f32(ring) / azToRingMetric), azCount, u.curlScale, f32(genStep));
  let grad = forcingGradient(az, ring, azCountI, ringCountI, azToRingMetric);

  // armGather's OWN forcing sample, offset from the crest by gatherOffset
  // texels: gas doesn't gather exactly on the ridge, it gathers where the
  // drift feeds it from, one flank upstream. The sign multiplies by
  // sign(shearVelAz), NOT a fixed sign — drift direction (and so which
  // flank is upstream) reverses at corotation, so a fixed-sign shift would
  // land the gather target behind the crest on one side of corotation and
  // ahead of it on the other. sign(0) = 0, so exactly at corotation the
  // shift collapses to 0 regardless of gatherOffset: no drift, no flank to
  // prefer. Only this sample moves — forcingSelf below (armDrag) and grad
  // above (the laneBias direction test) keep reading the unshifted texel.
  let gatherAz = wrapAz(az + i32(round(sign(shearVelAz) * u.gatherOffset)), azCountI);
  let gatherGrad = forcingGradient(gatherAz, ring, azCountI, ringCountI, azToRingMetric);
  // Counterweight so 120 steps of convergent gathering can't run the local
  // dust pile past its own overshoot ceiling unchecked — see ARM_GATHER_SAT.
  let gatherSat = max(0.0, 1.0 - localDust / ARM_GATHER_SAT);

  // Drift-stall shock caricature: drag the shear (only) by this texel's own
  // forcing, so drift stalls inside the arm and Pass B's divV convergence
  // term piles density at the upstream edge — see the param's own doc.
  let forcingSelf = armForcingAt(az, ring, azCountI, ringCountI);
  let stalledShear = shearVelAz * max(0.0, 1.0 - u.armDrag * forcingSelf);

  // Directional gate: gate on shearVelAz (the UNDRAGGED shear), not
  // stalledShear — armDrag's max(0, ...) clamps stalledShear to exactly 0
  // throughout the stall zone, which would make the sign test degenerate
  // right where the gate matters most. shearVelAz * grad.x > 0 means the
  // drift is carrying gas up-slope, toward the ridge (upstream flank).
  let gatherWeight = select(1.0 - u.laneBias, 1.0, shearVelAz * grad.x > 0.0);

  var velAz = stalledShear + u.curlStrength * curl.x + u.armGather * gatherSat * gatherWeight * gatherGrad.x;
  var velRing = u.curlStrength * curl.y + u.armGather * gatherSat * gatherWeight * gatherGrad.y;
  var eventStamp = 0.0;

  let azCountF = f32(azCount);
  for (var i = 0u; i < cullCount; i++) {
    let e = sharedEventIdx[i];
    let base = e * EVENT_STRIDE;
    let evAz = events[base];
    let evRing = events[base + 1u];
    let birthStep = events[base + 2u];
    let strength = events[base + 3u];
    let radiusScale = events[base + 4u];
    let age = f32(genStep) - birthStep;
    if (age < 0.0 || age >= u.impulseDuration) {
      continue;
    }

    var dAz = f32(az) - evAz;
    dAz = dAz - azCountF * floor(dAz / azCountF + 0.5); // shortest-path wrap
    let dRing = f32(ring) - evRing;
    let dAzRingUnits = dAz * azToRingMetric;
    let distRingUnits = sqrt(dAzRingUnits * dAzRingUnits + dRing * dRing);

    let growth = pow(max(age, 0.01), IMPULSE_GROWTH_EXPONENT);
    let kernelRadius = radiusScale * growth;
    let sigma = max(kernelRadius * 0.5, 0.25);
    let falloff = exp(-0.5 * (distRingUnits * distRingUnits) / (sigma * sigma));
    let ageFrac = age / u.impulseDuration;
    let intensity = falloff * (1.0 - ageFrac);

    if (falloff > 1e-4) {
      let dir = select(vec2<f32>(0.0, 0.0), vec2<f32>(dAzRingUnits, dRing) / distRingUnits, distRingUnits > 1e-5);
      let velKick = strength * intensity;
      velAz += velKick * dir.x / azToRingMetric;
      velRing += velKick * dir.y;
      eventStamp = max(eventStamp, intensity);
    }
  }

  return VelocitySample(vec2<f32>(velAz, velRing), eventStamp);
}

@compute @workgroup_size(16, 16)
fn cs(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(workgroup_id) wgid: vec3<u32>,
  @builtin(local_invocation_index) localIndex: u32,
) {
  let dims = textureDimensions(velocityTex);
  let azCount = dims.x;
  let ringCount = dims.y;
  let genStep = u32(stepIdx.step);
  let activeStart = u32(stepIdx.activeStart);
  let activeEnd = u32(stepIdx.activeEnd);

  let lnSpan = log(u.rMax / u.rMin);
  let dLnRPerRing = lnSpan / f32(ringCount - 1u);
  let dThetaPerAz = 2.0 * PI / f32(azCount);
  let azToRingMetric = dThetaPerAz / dLnRPerRing;

  // Tile cull: build the shared event list BEFORE any per-texel early
  // return, so workgroupBarrier() below is reached by every invocation
  // uniformly. (Grid dims are exact multiples of 16 so 'gid.xy >= dims'
  // never actually fires — but the compiler can't prove that, and a
  // barrier behind a data-dependent branch is undefined behaviour, so the
  // early return is deferred past both barriers regardless.)
  if (localIndex == 0u) {
    atomicStore(&sharedEventCount, 0u);
  }
  workgroupBarrier();

  let azCountF = f32(azCount);
  let tileAzMin = f32(wgid.x * 16u);
  let tileAzMax = tileAzMin + 15.0;
  let tileRingMin = f32(wgid.y * 16u);
  let tileRingMax = tileRingMin + 15.0;

  for (var e = activeStart + localIndex; e < activeEnd; e += 256u) {
    let base = e * EVENT_STRIDE;
    let evAz = events[base];
    let evRing = events[base + 1u];
    let birthStep = events[base + 2u];
    let radiusScale = events[base + 4u];
    let age = f32(genStep) - birthStep;
    if (age < 0.0 || age >= u.impulseDuration) {
      continue;
    }

    let growth = pow(max(age, 0.01), IMPULSE_GROWTH_EXPONENT);
    let sigma = max(radiusScale * growth * 0.5, 0.25);
    let cutoff = sigma * CUTOFF_SIGMA_MULT + TILE_CULL_MARGIN;

    // Nearest point on the tile's bounding box to this event, az
    // shortest-path wrapped (tiles never straddle the wrap seam — dims are
    // exact multiples of 16 — only the event-to-tile distance can).
    var azDist = 0.0;
    if (evAz < tileAzMin) {
      azDist = tileAzMin - evAz;
    } else if (evAz > tileAzMax) {
      azDist = evAz - tileAzMax;
    }
    azDist = min(azDist, azCountF - azDist);
    let azDistRingUnits = azDist * azToRingMetric;

    var ringDist = 0.0;
    if (evRing < tileRingMin) {
      ringDist = tileRingMin - evRing;
    } else if (evRing > tileRingMax) {
      ringDist = evRing - tileRingMax;
    }

    let distToTile = sqrt(azDistRingUnits * azDistRingUnits + ringDist * ringDist);
    if (distToTile <= cutoff) {
      let slot = atomicAdd(&sharedEventCount, 1u);
      if (slot < TILE_EVENT_CAP) {
        sharedEventIdx[slot] = e;
      }
    }
  }
  workgroupBarrier();
  let cullCount = min(atomicLoad(&sharedEventCount), TILE_EVENT_CAP);

  if (any(gid.xy >= dims)) {
    return;
  }

  let sample = composedVelocity(i32(gid.x), i32(gid.y), azCount, ringCount, azToRingMetric, genStep, cullCount);
  textureStore(velocityTex, vec2<i32>(i32(gid.x), i32(gid.y)), vec4<f32>(sample.vel.x, sample.vel.y, sample.eventStamp, 0.0));
}
