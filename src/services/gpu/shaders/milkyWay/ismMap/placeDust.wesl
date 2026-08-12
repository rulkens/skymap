// milkyWay/ismMap/placeDust.wesl — GPU port of the CPU's former
// buildDustParticleCloud map-seeded placement body, one invocation per
// particle SLOT (MAX_PARTICLE_COUNT ceiling). The CPU still decides slot
// COUNT; this shader decides slot CONTENT, including the
// mapDensity/smoothDisc MODE itself (see 'usesMapDensity' below) — nothing
// here depends on the async CPU ismMap readback. A slot that fails the
// survival floor writes amplitude 0 rather than being skipped.
// comps[dustOffset+i] carries RAW mass; ringReduce.wesl's survivor-sum +
// dustMap/fragment.wesl's consume-time multiply supply the missing Larson
// massPerR2 scale.

import package::milkyWay::field::armRidge::ArmRec;
import package::milkyWay::field::armRidge::ArmRidgeGeometry;
import package::milkyWay::field::records::FieldComponentRec;
import package::milkyWay::ismMap::clusteredDiscPlacement::genRand;
import package::milkyWay::ismMap::clusteredDiscPlacement::sampleOrientationNearest;
import package::milkyWay::ismMap::clusteredDiscPlacement::cdpRingIndexForSample;
import package::milkyWay::ismMap::clusteredDiscPlacement::cdpRingIndexForRadius;
import package::milkyWay::ismMap::clusteredDiscPlacement::cdpAzIndexForAngle;
import package::milkyWay::ismMap::clusteredDiscPlacement::inverseCovarianceFromFrame;
import package::milkyWay::ismMap::clusteredDiscPlacement::buildClusteredDiscPlacementChild;
import package::milkyWay::ismMap::clusteredDiscPlacement::CDP_POP_COMPLEX;
import package::milkyWay::ismMap::clusteredDiscPlacement::CDP_POP_CHILD;

// Mirrors dustParticleCloud.ts's DUST_SURVIVAL_FLOOR_FRAC — parity-tested in
// constants.parity.test.ts alongside ismMapPresent.wesl's own copy. A THIRD
// hand mirror rather than importing ismMapPresent.wesl's: that file is a
// full render-pass module (its own texture/sampler bind group), and this
// compute shader's bind group must not risk inheriting it.
const DUST_SURVIVAL_FLOOR_FRAC: f32 = 0.01;

// dustParticleCloud.ts's own non-exported constants, mirrored verbatim
// (same "mirror, no parity test" treatment armRidge.wesl gives
// ARM_WIDTH_FLOOR_H and friends) — this WGSL copy is now the only place
// they live.
const GLOBAL_MEAN_EPS: f32 = 1e-6;
const GMC_SIZE_POWER: f32 = 2.2;
const CLOUD_POLE_RATIO: f32 = 0.6;
const CHILD_POLE_RATIO: f32 = 0.4;
// (2*PI)^1.5 — the anisotropic Gaussian's own normalisation constant.
const TAU_ROOT3: f32 = 15.749609945722418;

// PlaceDustParams — SSoT for packPlaceDustParams.ts. u32 fields travel as
// REAL u32s (not f32-cast, unlike ismMapDustCdfScan.wesl's IsmMapCdfParams):
// 'seed' can exceed f32's 24-bit exact-integer range, so the packer aliases
// one ArrayBuffer with both a Uint32Array and a Float32Array view.
struct PlaceDustParams {
  seed: u32,
  count: u32,
  childrenPerComplex: u32,
  generatorIsFluid: u32,

  dustOffset: u32,
  gridRings: u32,
  gridAz: u32,
  _padU0: u32,

  rMin: f32,
  rMax: f32,
  complexSpread: f32,
  elongation: f32,

  sigmaZComplex: f32,
  discWeightSum: f32,
  sizeMin: f32,
  sizeMax: f32,

  discSigmaR: vec4<f32>,

  warpStrength: f32,
  warpTwist: f32,
  warpStartRadius: f32,
  outerRadius: f32,

  extinctionRgb: vec3<f32>,
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> params: PlaceDustParams;
@group(0) @binding(1) var<storage, read> prefixBuf: array<f32>;
@group(0) @binding(2) var<storage, read> ringMeansBuf: array<f32>;
@group(0) @binding(3) var ismMapTex: texture_2d<f32>;
@group(0) @binding(4) var orientationTex: texture_2d<f32>;
@group(0) @binding(5) var<storage, read_write> comps: array<FieldComponentRec>;
// massOut[i] mirrors comps[dustOffset+i].amplitude's own liveness gate
// (0 on a survival-floor miss) but carries the RAW radius^2 mass instead of
// the amplitude the record derives from it — ringReduce.wesl's
// csSurvivorSum kernel sums this slot-indexed array (not comps, which has
// no cheap way back to radius^2 once aspect has skewed sigAlong/sigAcross).
@group(0) @binding(6) var<storage, read_write> massOut: array<f32>;

@compute @workgroup_size(256)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.count) {
    return;
  }

  // Mode decision moves INTO the shader (the CPU's former mode-selection
  // gate, off GPU-resident buffers instead of the CPU readback that gate
  // used to require) — this is what keeps the placement-critical path off
  // the async mapAsync round trip entirely.
  let cdfLen = params.gridRings * params.gridAz;
  let total = prefixBuf[cdfLen - 1u];
  var globalMean = 0.0;
  for (var r = 0u; r < params.gridRings; r++) {
    globalMean += ringMeansBuf[r];
  }
  globalMean = globalMean / f32(params.gridRings);
  let usesMapDensity = params.generatorIsFluid != 0u && globalMean >= GLOBAL_MEAN_EPS && total > 0.0;
  let mode = select(1u, 0u, usesMapDensity);

  let geom = ArmRidgeGeometry(
    0.0, 0.0, 0.0, 0.0, 0.0,
    params.warpStrength, params.warpTwist, params.warpStartRadius, params.outerRadius,
  );
  let hasOrientation = params.generatorIsFluid != 0u;

  // CDP_POP_COMPLEX/CDP_POP_CHILD passed EXPLICITLY (not left to a hardcoded
  // default inside buildClusteredDiscPlacementChild): dust and arm cloud
  // must draw from genuinely independent (pop, idx, slot) coordinates even
  // though both share 'params.seed'. These are dust's OWN unchanged values,
  // so this shader's output is unaffected.
  //
  // Trailing 6 args are mode 2u's ('analytic', the arm cloud's own) inputs
  // — this shader never reaches that branch (mode is always 0u/1u above),
  // so a zeroed ArmRec + degenerate armLogMax<=armLogMin (0.0, 0.0) is
  // harmless filler, not a real placement.
  let placed = buildClusteredDiscPlacementChild(
    params.seed, i, params.childrenPerComplex, mode,
    CDP_POP_COMPLEX, CDP_POP_CHILD,
    &prefixBuf, total, params.gridRings, params.gridAz, params.rMin, params.rMax,
    params.discSigmaR, params.discWeightSum,
    params.complexSpread, params.elongation, params.sigmaZComplex, CHILD_POLE_RATIO,
    geom,
    hasOrientation, orientationTex, params.gridRings, params.gridAz, params.rMin, params.rMax,
    ArmRec(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0), 0.0, 0.0,
    0.0, 0.0, 0.0,
  );

  // drawPayload — the CPU's former per-child radius draw (1 slot) plus S3's
  // deterministic (no-draw) aspect/survival lookup at the CHILD's own
  // scattered position, exactly mirroring the CPU's post-scatter timing.
  let u = genRand(params.seed, CDP_POP_CHILD, i, 6u);
  let sizeExp = 1.0 - GMC_SIZE_POWER;
  let sizeMinPow = pow(params.sizeMin, sizeExp);
  let sizeMaxPow = pow(params.sizeMax, sizeExp);
  let radius = pow(u * (sizeMaxPow - sizeMinPow) + sizeMinPow, 1.0 / sizeExp);

  var aspect = params.elongation;
  var alive = true;
  if (usesMapDensity) {
    let childRadius = length(vec2<f32>(placed.center.x, placed.center.z));
    let childAngle = atan2(placed.center.z, placed.center.x);
    let coherence = sampleOrientationNearest(
      orientationTex, childRadius, childAngle, params.gridRings, params.gridAz, params.rMin, params.rMax,
    ).y;
    let azIdx = cdpAzIndexForAngle(childAngle, params.gridAz);
    // dustSample's own ring index: FLOOR bucket (cdpRingIndexForSample),
    // matching sampleGalaxyIsmMap's internals exactly — this is the texel
    // the CPU's own 'sample.dust' reads.
    let sampleRing = cdpRingIndexForSample(childRadius, params.gridRings, params.rMin, params.rMax);
    let dustSample = textureLoad(ismMapTex, vec2<i32>(i32(azIdx), i32(sampleRing)), 0).w;
    // ringMean's own ring index: ROUND-to-nearest (cdpRingIndexForRadius) —
    // the CPU's former sampleMapTraits divided by
    // ringMeans[ismMapRingIndexForRadius(radius, ...)], a DIFFERENT ring
    // selection than the sample above. Two ring semantics in one ratio is
    // the CPU's own oddity; ported as such, not "fixed".
    let meanRing = cdpRingIndexForRadius(childRadius, params.gridRings, params.rMin, params.rMax);
    let ringMean = ringMeansBuf[meanRing];
    aspect = 1.0 + (params.elongation - 1.0) * coherence;
    alive = dustSample >= DUST_SURVIVAL_FLOOR_FRAC * ringMean;
  }

  // Area-preserving aspect on the map path (along*across == radius^2 always)
  // vs. elongation-fixed off it — the CPU's former sigmas branch.
  var sigAlong: f32;
  var sigAcross: f32;
  if (usesMapDensity) {
    sigAlong = radius * sqrt(aspect);
    sigAcross = radius / sqrt(aspect);
  } else {
    sigAlong = radius * aspect;
    sigAcross = radius;
  }
  let sigPole = radius * CLOUD_POLE_RATIO;

  // Raw radius-derived mass, NO Larson massPerR2 renorm baked in
  // (ringReduce.wesl supplies it as a consume-time uniform multiply). A
  // survival-floor miss zeroes amplitude but the record is still written
  // (amplitude-as-liveness).
  let mass = radius * radius;
  let amplitude = select(0.0, mass / (TAU_ROOT3 * sigAlong * sigAcross * sigPole), alive);
  massOut[i] = select(0.0, mass, alive);

  let invCov = inverseCovarianceFromFrame(placed.frame, sigAlong, sigAcross, sigPole);

  var rec: FieldComponentRec;
  rec.invCovDiagonal = invCov.diag;
  rec.amplitude = amplitude;
  rec.invCovOffDiagonal = invCov.offDiag;
  rec.boundRadius = max(sigAlong, max(sigAcross, sigPole));
  rec.color = params.extinctionRgb;
  rec.textureWeight = 0.0;
  rec.center = placed.center;
  rec.starsWeight = 0.0;

  comps[params.dustOffset + i] = rec;
}
