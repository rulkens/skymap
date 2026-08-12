// milkyWay/ismMap/placeArmSpurCloud.wesl — GPU port of
// armSpurParticleCloud.ts's buildArmSpurParticleCloud (:125-219), one
// invocation per particle SLOT (SPUR_CLOUD_MAX_COUNT = 400 ceiling,
// armSpurParticleCloud.ts:48). The CPU still decides slot COUNT
// (galaxyFieldMixture.ts's spurCloudCount reservation) and the per-spur
// weight table (packArmSpurCloudRecords.ts ports spurFootprintIntegral
// verbatim, per the plan's 'port the integral into the packer, not the
// shader' contract); this shader decides slot CONTENT — the weighted spur
// pick, the rejection-sampled position along it, and the Gaussian
// cross/pole scatter.
//
// NOT a mode of buildClusteredDiscPlacementChild (clusteredDiscPlacement.wesl):
// a spur has no clumping hierarchy (armSpurParticleCloud.ts's own header —
// 'Complex-less scatter'), and its span starts at its OWN root
// (spanStartLogR), breaking that sampler's hardcoded ARM_SPAN_START_FRAC
// floor. Single-level rejection-sample-then-scatter, its own shader.
//
// A slot that never reaches a live spur (params.spurCount == 0, or every
// weight <= 0) is never DISPATCHED at all — the host guards both before
// calling dispatchPlaceArmSpurCloud, the same 'CPU decides whether this tier
// runs' discipline computePlaceDustBudget's own null return uses.
//
// fluxWeightOut (binding 3) mirrors placeArmCloud.wesl's own binding 5 (in
// turn placeDust.wesl's massOut): 'flux' below bakes in spurFlux WITHOUT
// dividing by fluxWeightSum (armSpurParticleCloud.ts:199-203's own sum) —
// Task 15's ringReduce.wesl kernel reduces this array and writes
// 1/fluxWeightSum as the consume-time scale fieldSplat/fragment.wesl
// multiplies in.

import package::milkyWay::field::armRidge::ArmRec;
import package::milkyWay::field::armRidge::ArmRidgeGeometry;
import package::milkyWay::field::armRidge::armRidgeFrameAt;
import package::milkyWay::field::armRidge::armFadeEnvelope;
import package::milkyWay::field::armRidge::armCrossSigma;
import package::milkyWay::field::armRidge::armExcessSurfaceShape;
import package::milkyWay::field::armRidge::armColor;
import package::milkyWay::field::records::FieldComponentRec;
import package::milkyWay::ismMap::clusteredDiscPlacement::genRand;
import package::milkyWay::ismMap::clusteredDiscPlacement::genNormal;
import package::milkyWay::ismMap::clusteredDiscPlacement::CloudFrame;
import package::milkyWay::ismMap::clusteredDiscPlacement::inverseCovarianceFromFrame;

// SIZE_MIN_RATIO/SIZE_MAX_RATIO are armSpurParticleCloud.ts's own
// non-exported constants, still mirrored verbatim (same 'mirror, no parity
// test' treatment armRidge.wesl gives its own non-scalar-const mirrors);
// SPUR_FADE_REJECTION_TRIES/CROSS_OFFSET_RATIO/POLE_OFFSET_RATIO/
// SPRITE_POLE_RATIO were armSpurParticleCloud.ts's own placement-body
// constants — Task 16 deleted that body along with them, so this WGSL copy
// is now the only place they live.
const SPUR_FADE_REJECTION_TRIES: u32 = 24u;
const CROSS_OFFSET_RATIO: f32 = 0.6;
const POLE_OFFSET_RATIO: f32 = 0.8;
const SIZE_MIN_RATIO: f32 = 0.35;
const SIZE_MAX_RATIO: f32 = 1.0;
const SPRITE_POLE_RATIO: f32 = 0.6;
// (2*PI)^1.5 — the anisotropic Gaussian's own normalisation constant,
// formerly armSpurParticleCloud.ts's TAU_ROOT3 (deleted with its placement
// body, Task 16); placeDust.wesl mirrors the same value independently
// rather than being imported here — see that file's doc for why: a THIRD
// hand mirror, not a shared one, keeps this compute shader's own bind group
// from risking inheriting an unrelated module.
const TAU_ROOT3: f32 = 15.749609945722418;

// 'SPRC' — formerly armSpurParticleCloud.ts's own CPU rng seed-salt value
// (SPUR_CLOUD_SEED_SALT, deleted with that file's placement body, Task 16),
// repurposed here as this shader's distinct population tag: every draw in
// this file is keyed on the SAME (seed, POP, i) pair with a running SLOT
// counter, so one population is enough — unlike clusteredDiscPlacement.wesl's
// complex/child split, a spur has no second index space (no clumping
// hierarchy) to keep separate.
const PLACE_SPUR_CLOUD_POP: u32 = 0x53505243u;

struct SpurRecord {
  phase: f32,
  pitch: f32,
  fadeRadius: f32,
  spanStartLogR: f32,
  age: f32,
  weight: f32,
  _pad0: f32,
  _pad1: f32,
}

// PlaceArmSpurCloudParams — SSoT for packPlaceArmSpurCloudParams.ts. u32
// fields travel as REAL u32s (placeDust.wesl's own precedent): 'seed' can
// exceed f32's 24-bit exact-integer range.
struct PlaceArmSpurCloudParams {
  seed: u32,
  count: u32,
  spurCount: u32,
  reservationOffset: u32,

  spurFlux: f32,
  weightSum: f32,
  elongation: f32,
  sizeScale: f32,

  widthScale: f32,
  excessScaleRatio: f32,
  hLight: f32,
  diskHeight: f32,

  armStartRadius: f32,
  armInnerRampW: f32,
  armFullRadius: f32,
  waveAmount: f32,

  diskScaleLen: f32,
  warpStrength: f32,
  warpTwist: f32,
  warpStartRadius: f32,

  outerRadius: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}

@group(0) @binding(0) var<uniform> params: PlaceArmSpurCloudParams;
@group(0) @binding(1) var<storage, read> spurRecords: array<SpurRecord>;
@group(0) @binding(2) var<storage, read_write> comps: array<FieldComponentRec>;
// Task 15's raw per-slot flux weight — see this file's own header doc above.
@group(0) @binding(3) var<storage, read_write> fluxWeightOut: array<f32>;

@compute @workgroup_size(256)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.count) {
    return;
  }

  let geom = ArmRidgeGeometry(
    params.armStartRadius, params.armInnerRampW, params.armFullRadius, params.waveAmount,
    params.diskScaleLen, params.warpStrength, params.warpTwist, params.warpStartRadius,
    params.outerRadius,
  );

  // pickWeighted — armSpurParticleCloud.ts's own weighted spur pick
  // (formerly clusteredDiscPlacement.ts's pickWeighted, ported verbatim;
  // both TS functions are gone, deleted with their CPU callers, Task 16), 1
  // draw. The CPU's own fallback ('return weights.length - 1' when a
  // float-rounding pick lands past the last partial sum) is reproduced by
  // seeding spurIndex at the last valid entry before the scan.
  var slot = 0u;
  let pick = genRand(params.seed, PLACE_SPUR_CLOUD_POP, i, slot) * params.weightSum;
  slot += 1u;
  var spurIndex = params.spurCount - 1u;
  var acc = 0.0;
  for (var j = 0u; j < params.spurCount; j++) {
    acc += spurRecords[j].weight;
    if (pick <= acc) {
      spurIndex = j;
      break;
    }
  }
  let spur = spurRecords[spurIndex];
  // meanderAmp/meanderFreq/meanderPhase/waveF1/waveP1/waveF2/waveP2 all 0 —
  // armSpurGeometry.ts's buildSpurRecord hardcodes them too (its own
  // 'continuity at the root' doc): a spur's ridge curve is a pure log-spiral,
  // never meandered or waved.
  let arm = ArmRec(spur.phase, spur.pitch, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, spur.fadeRadius);

  // Rejection-sample a point along the spur's OWN span (spanStartLogR to its
  // fadeRadius) — armSpurParticleCloud.ts:154-160. Each try spends TWO draws
  // (logR, accept) whether or not it accepts: the running 'slot' counter,
  // not the CPU's own early-exit-skips-remaining-draws stream position, is
  // what keeps every later draw's slot deterministic per invocation (this
  // file's own stateless-hash discipline, same as clusteredDiscPlacement.wesl's
  // header) — logR/radius are REASSIGNED every iteration regardless of
  // accept, mirroring the CPU's own loop exactly.
  let logStart = spur.spanStartLogR;
  let logEnd = log(spur.fadeRadius / params.armStartRadius);
  var logR = logStart;
  var radius = params.armStartRadius * exp(logStart);
  for (var tries = 0u; tries < SPUR_FADE_REJECTION_TRIES; tries++) {
    logR = logStart + genRand(params.seed, PLACE_SPUR_CLOUD_POP, i, slot) * (logEnd - logStart);
    slot += 1u;
    radius = params.armStartRadius * exp(logR);
    let accept = genRand(params.seed, PLACE_SPUR_CLOUD_POP, i, slot) < armFadeEnvelope(radius, arm, geom);
    slot += 1u;
    if (accept) {
      break;
    }
  }

  let frame = armRidgeFrameAt(logR, arm, geom);
  let crossSigma = armCrossSigma(radius, params.widthScale, geom);
  let acrossOffset = genNormal(params.seed, PLACE_SPUR_CLOUD_POP, i, slot) * crossSigma * CROSS_OFFSET_RATIO;
  slot += 2u;
  let poleOffset = genNormal(params.seed, PLACE_SPUR_CLOUD_POP, i, slot) * params.diskHeight * POLE_OFFSET_RATIO;
  slot += 2u;
  let center = frame.point + frame.across * acrossOffset + frame.pole * poleOffset;

  let sizeFrac = SIZE_MIN_RATIO
    + genRand(params.seed, PLACE_SPUR_CLOUD_POP, i, slot) * (SIZE_MAX_RATIO - SIZE_MIN_RATIO);
  slot += 1u;
  let spriteRadius = crossSigma * sizeFrac * params.sizeScale;

  // R^2-holds-surface-brightness flux weight — armSpurParticleCloud.ts:184-195,
  // evaluated at the FINAL scattered (post-offset) radius, matching the
  // CPU's own Math.hypot(p.center[0], p.center[2]). Raw, unnormalised: NOT
  // divided by fluxWeightSum (Task 15 supplies that as a consume-time
  // uniform, the same split Task 13 makes for the arm cloud) — spurFlux
  // alone is baked in here.
  let particleRadius = length(vec2<f32>(center.x, center.z));
  let shape = armExcessSurfaceShape(particleRadius, params.hLight, params.excessScaleRatio, geom);
  let fluxWeight = spriteRadius * spriteRadius * shape;
  fluxWeightOut[i] = fluxWeight;
  let flux = params.spurFlux * fluxWeight;

  let sigAlong = spriteRadius * params.elongation;
  let sigAcross = spriteRadius;
  let sigPole = spriteRadius * SPRITE_POLE_RATIO;
  let amplitude = flux / (TAU_ROOT3 * sigAlong * sigAcross * sigPole);

  let invCov = inverseCovarianceFromFrame(
    CloudFrame(frame.along, frame.across, frame.pole), sigAlong, sigAcross, sigPole,
  );

  // age (0=young) inverted into armColor's youngFraction (1=young) —
  // armSpurParticleCloud.ts:206-210's own comment: spurs are drawn young, so
  // this reads bluer than the parent arm regardless of the galaxy's own
  // youngFraction.
  let color = armColor(1.0 - spur.age, particleRadius / params.outerRadius);

  var rec: FieldComponentRec;
  rec.invCovDiagonal = invCov.diag;
  rec.amplitude = amplitude;
  rec.invCovOffDiagonal = invCov.offDiag;
  rec.boundRadius = max(sigAlong, max(sigAcross, sigPole));
  rec.color = color;
  rec.textureWeight = 0.0;
  rec.center = center;
  rec.starsWeight = 0.0;

  comps[params.reservationOffset + i] = rec;
}
