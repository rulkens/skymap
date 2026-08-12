// milkyWay/ismMap/placeDust.wesl — GPU port of dustParticleCloud.ts's
// map-seeded placement (:156-317), one invocation per particle SLOT
// (MAX_PARTICLE_COUNT = 40000 ceiling, dustParticleCloud.ts:40). The CPU
// still decides slot COUNT (createIsmMapPlaceDust.ts's budget math, same
// shape as dustParticleCloud.ts:130-141); this shader decides slot CONTENT,
// including the mapDensity/smoothDisc MODE itself — see 'usesMapDensity'
// below — so nothing here depends on the async CPU ismMap readback.
//
// A slot that fails the survival floor (DUST_SURVIVAL_FLOOR_FRAC) writes
// amplitude 0 rather than being skipped: a zero-amplitude Gaussian splat
// draws nothing, the same practical effect as v1's alive=false StarRec,
// without a spare boolean lane FieldComponentRec doesn't have.

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

// Mirrors dustParticleCloud.ts's DUST_SURVIVAL_FLOOR_FRAC — parity-tested in
// constants.parity.test.ts alongside ismMapPresent.wesl's own copy. A THIRD
// hand mirror rather than importing ismMapPresent.wesl's: that file is a
// full render-pass module (its own texture/sampler bind group), and this
// compute shader's bind group must not risk inheriting it.
const DUST_SURVIVAL_FLOOR_FRAC: f32 = 0.01;

// dustParticleCloud.ts's own non-exported constants, mirrored verbatim (same
// "mirror, no parity test" treatment armRidge.wesl gives ARM_WIDTH_FLOOR_H
// and friends).
const GLOBAL_MEAN_EPS: f32 = 1e-6;
const GMC_SIZE_POWER: f32 = 2.2;
const CLOUD_POLE_RATIO: f32 = 0.6;
const CHILD_POLE_RATIO: f32 = 0.4;
// (2*PI)^1.5 — dustParticleCloud.ts's TAU_ROOT3, the anisotropic Gaussian's
// own normalisation constant.
const TAU_ROOT3: f32 = 15.749609945722418;

const PLACE_DUST_POP_CHILD: u32 = 0xC41Du; // matches clusteredDiscPlacement.wesl's own CDP_POP_CHILD

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

@compute @workgroup_size(256)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.count) {
    return;
  }

  // Mode decision moves INTO the shader (dustParticleCloud.ts:188-236's own
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

  // Trailing 6 args are mode 2u's ('analytic', Task 13's arm cloud) own
  // inputs — this shader never reaches that branch (mode is always 0u/1u
  // above), so a zeroed ArmRec + degenerate armLogMax<=armLogMin (0.0, 0.0)
  // is harmless filler, not a real placement.
  let placed = buildClusteredDiscPlacementChild(
    params.seed, i, params.childrenPerComplex, mode,
    &prefixBuf, total, params.gridRings, params.gridAz, params.rMin, params.rMax,
    params.discSigmaR, params.discWeightSum,
    params.complexSpread, params.elongation, params.sigmaZComplex, CHILD_POLE_RATIO,
    geom,
    hasOrientation, orientationTex, params.gridRings, params.gridAz, params.rMin, params.rMax,
    ArmRec(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0), 0.0, 0.0,
    0.0, 0.0, 0.0,
  );

  // drawPayload — dustParticleCloud.ts's own per-child radius draw (1 slot)
  // plus S3's deterministic (no-draw) aspect/survival lookup at the CHILD's
  // own scattered position, exactly mirroring the CPU's post-scatter timing.
  let u = genRand(params.seed, PLACE_DUST_POP_CHILD, i, 6u);
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
    // dustParticleCloud.ts:228-238's sampleMapTraits divides by
    // ringMeans[ismMapRingIndexForRadius(radius, ...)], a DIFFERENT ring
    // selection than the sample above. Two ring semantics in one ratio is
    // the CPU's own oddity; ported as such, not "fixed".
    let meanRing = cdpRingIndexForRadius(childRadius, params.gridRings, params.rMin, params.rMax);
    let ringMean = ringMeansBuf[meanRing];
    aspect = 1.0 + (params.elongation - 1.0) * coherence;
    alive = dustSample >= DUST_SURVIVAL_FLOOR_FRAC * ringMean;
  }

  // Area-preserving aspect on the map path (along*across == radius^2 always)
  // vs. elongation-fixed off it — dustParticleCloud.ts:296-307.
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

  // Raw radius-derived mass, NO Larson massPerR2 renorm baked in (Task 9
  // supplies it as a consume-time uniform multiply — see the plan's
  // "Renorm: consume-time scale" design). A survival-floor miss zeroes
  // amplitude but the record is still written (spec's amplitude-as-liveness).
  let mass = radius * radius;
  let amplitude = select(0.0, mass / (TAU_ROOT3 * sigAlong * sigAcross * sigPole), alive);

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
