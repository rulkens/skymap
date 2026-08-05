// milkyWay/sfMap/sfMapFluidStep.wesl — the FLUID alternative to
// sfMapAutomatonStep.wesl's cellular automaton: density advected through a
// composed, analytically-evaluated velocity field (shear + curl noise +
// event impulses + arm-gather, up the SAME arm-forcing field the automaton
// samples), semi-Lagrangian, directly in WORLD/grid coordinates every step.
// Unlike the automaton there is no material-frame trick and no final
// un-shear pass — sfMapFluidPack.wesl's own repack is a straight copy.
//
// State layout is IDENTICAL to the automaton's own ping-pong texel (gas,
// age, dust, oldActivity), but gas/dust are ADVECTED (semi-Lagrangian
// back-trace into prevTex) while age/oldActivity are EULERIAN (read from
// this texel's own previous value, never resampled) — age is a per-texel
// clock, not a transported quantity.
//
// Velocity is authored directly in TEXEL/step units on every axis, so no
// metric conversion is needed for the back-trace itself. The one place
// physical (theta, ln r) isotropy matters is KERNEL SHAPE — the curl noise's
// spatial domain and an event's outward-distance metric both rescale by
// azToRingMetric below, so a round feature in real space reads round in
// texel space too, not squashed by whichever axis is more finely sampled
// (1536 az texels over 2*PI radians vs 512 ring texels over ln(rMax/rMin)
// e-folds — see galaxySfMapArmForcing.ts's own header for the log-radial
// grid).

import package::lib::util::hash21;
import package::milkyWay::sfMap::sfMapShear::sfMapShearTexels;

struct SfMapFluidConstants {
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
}

struct SfMapFluidStepIndex {
  step: f32,
  // Index window into 'events' (already birthStep-sorted CPU-side, see
  // galaxySfMapFluidEvents.ts) active at THIS step: [activeStart, activeEnd).
  // Was a full 0..arrayLength(events) scan every step regardless of run
  // length, making one rebuild's total cost O(steps^2 * texels) — this
  // window keeps the per-step scan bounded by ~eventRate*impulseDuration,
  // independent of how many steps the run has (packSfMapFluidStepIndex.ts is
  // the offset authority, same convention as SfMapFluidConstants above).
  activeStart: f32,
  activeEnd: f32,
}

const PI: f32 = 3.14159265358979;
const SF_MAP_AMBIENT_DUST: f32 = 1.0;
const DUST_OVERSHOOT_CEILING: f32 = 8.0;
// Gas used to have no headroom (hard-clamped to 1.0), which is why
// ARM_GATHER_SAT below gates on dust instead — see that const's own comment.
// The compressible-continuity source term added below needs gas free to rise
// past 1 to show contrast, so it gets the SAME kind of headroom dust already
// had; 4.0 is half of DUST_OVERSHOOT_CEILING (8.0), not a re-derivation — gas
// is regenerated toward 1.0 every step (gasRegen) so it never needs as much
// headroom as dust, which has no such pull.
const GAS_CEILING: f32 = 4.0;
// Radial growth exponent for an active event's kernel — a look constant
// (snowplough-ish, between the momentum-conserving 0.4 and a bare linear
// expansion), not a Sedov-Taylor fit.
const IMPULSE_GROWTH_EXPONENT: f32 = 0.6;
// Event fields per packSfMapFluidEvents.ts's flat layout: az, ring,
// birthStep, strength, radiusScale, + 3 slack floats — THAT FILE is the
// offset authority.
const EVENT_STRIDE: u32 = 8u;
// Curl-noise phase drift rate, in noise-space units per step — a look
// constant (not a slider): slow enough that one step's diff still reads as
// continuous stirring, not a reroll.
const CURL_PHASE_SPEED: f32 = 0.03;
const CURL_FD_EPS: f32 = 0.5;
// Gate on DUST, not gas: gas is hard-clamped to 1.0 below regardless of the
// gather term's strength, so an "N x ambient" brake keyed on gas would never
// bind. Dust has no such ceiling short of DUST_OVERSHOOT_CEILING (8x) and is
// advected by the SAME velocity field, so it is the channel gather-driven
// convergence can actually run away in — this brake engages well before that
// hard ceiling. 3x = SF_MAP_AMBIENT_DUST's own headroom, a third of the way
// to DUST_OVERSHOOT_CEILING.
const ARM_GATHER_SAT: f32 = 3.0;
// Velocity is authored directly in texels/step (this file's header), so the
// back-trace's own implicit dt is 1 — this const documents that fact rather
// than encoding a free parameter to tune.
const DT_TEXELS_PER_STEP: f32 = 1.0;
// Clamp band on the per-step continuity multiplier (1 - dt*divV): wide
// enough for real convergence/divergence to read as structure, tight enough
// that one step's divergence spike can't null out or blow up a texel in one
// step (the source term itself is not a true conservative scheme — it is
// evaluated from a clamped, noisy velocity field — so this band is the
// numerical safety valve, not a physical bound).
const CONTINUITY_MULT_MIN: f32 = 0.6;
const CONTINUITY_MULT_MAX: f32 = 1.4;

@group(0) @binding(0) var<uniform> u: SfMapFluidConstants;
@group(0) @binding(1) var prevTex: texture_2d<f32>;
@group(0) @binding(2) var nextTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var<uniform> stepIdx: SfMapFluidStepIndex;
@group(0) @binding(4) var<storage, read> events: array<f32>;
@group(0) @binding(5) var armForcingTex: texture_2d<f32>;

// Value noise via bilinear-interpolated hashes (standard construction) —
// lib/util.wesl's own valueNoise2 bakes in a radial falloff tuned for a
// screen-space galaxy centre, which is the wrong shape for a texel-space
// stirring field, so this stays local until a second WESL caller wants it
// (lib/raySphere's own graduation rule, see that function's comment).
fn valueNoiseRaw(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let a = hash21(i);
  let b = hash21(i + vec2<f32>(1.0, 0.0));
  let c = hash21(i + vec2<f32>(0.0, 1.0));
  let d = hash21(i + vec2<f32>(1.0, 1.0));
  let s = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}

fn fbm2(p: vec2<f32>) -> f32 {
  var v = 0.0;
  var amp = 0.5;
  var freq = 1.0;
  for (var i = 0; i < 3; i++) {
    v += amp * valueNoiseRaw(p * freq);
    freq *= 2.0;
    amp *= 0.5;
  }
  return v;
}

// Divergence-free by construction: v = (dPsi/dy, -dPsi/dx) for a scalar
// potential Psi. gridPos is already metric-corrected by the caller (az,
// ring/azToRingMetric) so the potential's features are round in real space.
fn curlVelocity(gridPos: vec2<f32>, curlScale: f32, genStep: f32) -> vec2<f32> {
  let p = gridPos * curlScale + vec2<f32>(genStep * CURL_PHASE_SPEED, 0.0);
  let n1 = fbm2(p + vec2<f32>(0.0, CURL_FD_EPS));
  let n2 = fbm2(p - vec2<f32>(0.0, CURL_FD_EPS));
  let n3 = fbm2(p + vec2<f32>(CURL_FD_EPS, 0.0));
  let n4 = fbm2(p - vec2<f32>(CURL_FD_EPS, 0.0));
  let dPsiDy = (n1 - n2) / (2.0 * CURL_FD_EPS);
  let dPsiDx = (n3 - n4) / (2.0 * CURL_FD_EPS);
  return vec2<f32>(dPsiDy, -dPsiDx);
}

// Periodic az wrap, shared by armForcingAt below and composedVelocity's own
// neighbour lookups (divComposedVelocity) — the grid is periodic in az the
// same way everywhere it is read.
fn wrapAz(az: i32, azCount: i32) -> i32 {
  var a = az % azCount;
  if (a < 0) {
    a += azCount;
  }
  return a;
}

// armForcingTex read at an integer texel — az wraps (the grid is periodic),
// ring clamps at the disc's inner/outer edge, same edge semantics as
// sampleBilinear below. Unlike sfMapAutomatonStep.wesl's own armForcingAt,
// this never needs a sub-texel az sample: the gradient below always asks for
// this texel's own integer neighbours.
fn armForcingAt(az: i32, ring: i32, azCount: i32, ringCount: i32) -> f32 {
  let a = wrapAz(az, azCount);
  let r = clamp(ring, 0, ringCount - 1);
  return textureLoad(armForcingTex, vec2<i32>(a, r), 0).x;
}

// Steepest-ascent direction of the arm-forcing field, central-differenced
// over each axis's own integer neighbours. The ring partial is rescaled by
// azToRingMetric before being handed back — the SAME az-equivalent metric
// curlVelocity's gridPos uses — so the combined (az, ring) vector points
// toward a ridge along the true shortest path in (theta, ln r) space,
// rather than being skewed by whichever axis a texel covers less physical
// distance on. Caller applies the result to (velAz, velRing) directly, same
// convention as curlVelocity's own output (no further per-axis conversion:
// azToRingMetric is grid-wide constant, so any residual scale folds into
// the caller's own strength knob).
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
  // Only meaningful for the invocation's OWN texel (see cs() below) — the 4
  // neighbour evaluations divComposedVelocity makes for the divergence
  // estimate throw this away, but it is cheap to compute uniformly rather
  // than forking the event loop into a "with stamp"/"without stamp" copy.
  eventStamp: f32,
}

// The full composed velocity (shear + curl + event impulses + armGather) at
// an ARBITRARY (az, ring), not just the invocation's own texel — reused both
// for this texel's own advection velocity (cs() below) and, at its 4
// integer neighbours, for divComposedVelocity's central-difference
// divergence estimate, so the divergence sees the SAME field the advection
// actually used. Caller must pass an already-wrapped/clamped (az, ring) —
// see wrapAz/clamp callers below — this function does no edge handling of
// its own.
fn composedVelocity(
  az: i32,
  ring: i32,
  azCount: u32,
  ringCount: u32,
  azToRingMetric: f32,
  genStep: u32,
  activeStart: u32,
  activeEnd: u32,
) -> VelocitySample {
  let azCountI = i32(azCount);
  let ringCountI = i32(ringCount);
  let localDust = textureLoad(prevTex, vec2<i32>(az, ring), 0).z;

  let shearVelAz = sfMapShearTexels(u32(ring), ringCount, azCount, u.rMin, u.rMax, u.corotationRadius, u.shearStrength);
  let curl = curlVelocity(vec2<f32>(f32(az), f32(ring) / azToRingMetric), u.curlScale, f32(genStep));
  let grad = forcingGradient(az, ring, azCountI, ringCountI, azToRingMetric);
  // Counterweight so 120 steps of convergent gathering can't run the local
  // dust pile past its own overshoot ceiling unchecked — see ARM_GATHER_SAT.
  let gatherSat = max(0.0, 1.0 - localDust / ARM_GATHER_SAT);

  var velAz = shearVelAz + u.curlStrength * curl.x + u.armGather * gatherSat * grad.x;
  var velRing = u.curlStrength * curl.y + u.armGather * gatherSat * grad.y;
  // Dimensionless [0,1] intensity, NOT scaled by an event's own velocity
  // strength — this drives the age-reset threshold and the oldActivity EMA
  // target below, both of which want "how present is an event here", not a
  // speed.
  var eventStamp = 0.0;

  let azCountF = f32(azCount);
  for (var e = activeStart; e < activeEnd; e++) {
    let base = e * EVENT_STRIDE;
    let evAz = events[base];
    let evRing = events[base + 1u];
    let birthStep = events[base + 2u];
    let strength = events[base + 3u];
    let radiusScale = events[base + 4u];
    let age = f32(genStep) - birthStep;
    // activeStart/activeEnd already bound this to the window
    // packSfMapFluidStepIndex.ts computed CPU-side for this step — this is a
    // safety net against a boundary disagreement between the two, not load
    // bearing in the common case.
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

// Divergence of composedVelocity at (az, ring), central-differenced over
// each axis's own integer neighbours (az wraps, ring clamps — Neumann-ish:
// a clamped ring-edge neighbour equals the self texel, so the ring
// derivative there reads as zero rather than extrapolating off the grid).
// Mirrors forcingGradient's own azToRingMetric handling: the raw az partial
// stays unscaled, the ring partial is rescaled into the same az-equivalent
// units before the two are summed — pure semi-Lagrangian advection of a
// uniform field is a fixed point regardless of velocity (the back-trace
// always samples the same constant), so this divergence is what actually
// produces density structure in cs() below.
fn divComposedVelocity(
  az: i32,
  ring: i32,
  azCount: u32,
  ringCount: u32,
  azToRingMetric: f32,
  genStep: u32,
  activeStart: u32,
  activeEnd: u32,
) -> f32 {
  let azCountI = i32(azCount);
  let ringCountI = i32(ringCount);
  let azPlus = wrapAz(az + 1, azCountI);
  let azMinus = wrapAz(az - 1, azCountI);
  let ringPlus = clamp(ring + 1, 0, ringCountI - 1);
  let ringMinus = clamp(ring - 1, 0, ringCountI - 1);

  let vPlusAz = composedVelocity(azPlus, ring, azCount, ringCount, azToRingMetric, genStep, activeStart, activeEnd).vel.x;
  let vMinusAz = composedVelocity(azMinus, ring, azCount, ringCount, azToRingMetric, genStep, activeStart, activeEnd).vel.x;
  let vPlusRing = composedVelocity(az, ringPlus, azCount, ringCount, azToRingMetric, genStep, activeStart, activeEnd).vel.y;
  let vMinusRing = composedVelocity(az, ringMinus, azCount, ringCount, azToRingMetric, genStep, activeStart, activeEnd).vel.y;

  let dVelAzDAz = (vPlusAz - vMinusAz) * 0.5;
  let dVelRingDRing = (vPlusRing - vMinusRing) * 0.5;
  return dVelAzDAz + dVelRingDRing * azToRingMetric;
}

// Bilinear sample of prevTex — wraps in az, clamps in ring, same edge
// semantics as sfMapAutomatonStep.wesl's own neighbour reads.
fn sampleBilinear(azF: f32, ringF: f32, azCount: u32, ringCount: u32) -> vec4<f32> {
  let a0f = floor(azF);
  let fracAz = azF - a0f;
  var a0 = i32(a0f) % i32(azCount);
  if (a0 < 0) {
    a0 += i32(azCount);
  }
  let a1 = (a0 + 1) % i32(azCount);

  let r0f = floor(ringF);
  let fracRing = clamp(ringF - r0f, 0.0, 1.0);
  let r0 = clamp(i32(r0f), 0, i32(ringCount) - 1);
  let r1 = clamp(r0 + 1, 0, i32(ringCount) - 1);

  let c00 = textureLoad(prevTex, vec2<i32>(a0, r0), 0);
  let c10 = textureLoad(prevTex, vec2<i32>(a1, r0), 0);
  let c01 = textureLoad(prevTex, vec2<i32>(a0, r1), 0);
  let c11 = textureLoad(prevTex, vec2<i32>(a1, r1), 0);
  let cx0 = mix(c00, c10, fracAz);
  let cx1 = mix(c01, c11, fracAz);
  return mix(cx0, cx1, fracRing);
}

@compute @workgroup_size(16, 16)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(nextTex);
  if (any(gid.xy >= dims)) {
    return;
  }
  let azCount = dims.x;
  let ringCount = dims.y;
  let az = gid.x;
  let ring = gid.y;
  let genStep = u32(stepIdx.step);

  // Same seed as the automaton's own step 0 (sfMapAutomatonStep.wesl) — the
  // two generators must agree on what an unrun map looks like, since the
  // dust/HII consumers never know which one produced it.
  if (genStep == 0u) {
    textureStore(nextTex, vec2<i32>(i32(az), i32(ring)), vec4<f32>(1.0, 1.0e4, SF_MAP_AMBIENT_DUST, 0.0));
    return;
  }

  // Metric: physical theta per az-texel over physical ln(r) per ring-texel —
  // see this file's header. Ratio is grid-wide constant (the shared r^2
  // conformal factor cancels), not a per-ring quantity.
  let lnSpan = log(u.rMax / u.rMin);
  let dLnRPerRing = lnSpan / f32(ringCount - 1u);
  let dThetaPerAz = 2.0 * PI / f32(azCount);
  let azToRingMetric = dThetaPerAz / dLnRPerRing;

  // Read early — this step's velocity needs it (the gather saturation gate
  // below), and age/oldActivity below reuse the same load rather than
  // issuing a second one.
  let selfState = textureLoad(prevTex, vec2<i32>(i32(az), i32(ring)), 0);

  let activeStart = u32(stepIdx.activeStart);
  let activeEnd = u32(stepIdx.activeEnd);
  let selfVel = composedVelocity(i32(az), i32(ring), azCount, ringCount, azToRingMetric, genStep, activeStart, activeEnd);
  let velAz = selfVel.vel.x;
  let velRing = selfVel.vel.y;
  let eventStamp = selfVel.eventStamp;
  let divV = divComposedVelocity(i32(az), i32(ring), azCount, ringCount, azToRingMetric, genStep, activeStart, activeEnd);

  let azCountF = f32(azCount);

  // Semi-Lagrangian back-trace, dt = 1 step: gas/dust sample where THIS
  // texel's material came FROM, not where it self-reads (contrast age/
  // oldActivity below).
  var prevAzF = (f32(az) - velAz) % azCountF;
  if (prevAzF < 0.0) {
    prevAzF += azCountF;
  }
  let prevRingF = clamp(f32(ring) - velRing, 0.0, f32(ringCount - 1u));
  let advected = sampleBilinear(prevAzF, prevRingF, azCount, ringCount);

  // Compressible-continuity source: pure semi-Lagrangian advection of a
  // spatially-uniform field is a fixed point of the back-trace regardless of
  // velocity (it always samples the same constant), so the density
  // structure the debug view is supposed to show has to come from HERE, not
  // from advection alone — mass piles up where the composed field converges
  // (divV < 0) and thins where it diverges (divV > 0).
  let continuityMult = clamp(1.0 - DT_TEXELS_PER_STEP * divV, CONTINUITY_MULT_MIN, CONTINUITY_MULT_MAX);
  let advectedGas = advected.x * continuityMult;
  let advectedDust = advected.z * continuityMult;

  let selfAge = selfState.y;
  let selfOldActivity = selfState.w;

  let gas = min(GAS_CEILING, advectedGas + u.gasRegen);
  var age = selfAge + 1.0;
  // "Core" threshold: an event only just born here dominates the intensity
  // sum (its kernel radius is still near-zero, see growth above), so this
  // fires exactly at an event's own birth texel/step, not on its whole
  // decaying tail.
  if (eventStamp > 0.5) {
    age = 0.0;
  }
  let dust = min(advectedDust, DUST_OVERSHOOT_CEILING);
  let oldActivity = mix(selfOldActivity, eventStamp, u.emaRate);

  textureStore(nextTex, vec2<i32>(i32(az), i32(ring)), vec4<f32>(gas, age, dust, oldActivity));
}
