// milkyWay/ismMap/placeArmCloud.wesl — GPU port of armParticleCloud.ts's
// buildArmParticleCloud (:154-258), one invocation per particle SLOT
// (ARM_CLOUD_MAX_COUNT = 2000 ceiling, armParticleCloud.ts:38). The CPU
// still decides slot COUNT (deriveArmCloudCount, unchanged, still CPU-side —
// galaxyFieldMixture.ts's own reservation); this shader decides slot
// CONTENT, including the arm-lane-vs-smooth-disc roll itself
// (buildClusteredDiscPlacementChild's mode 2u, clusteredDiscPlacement.wesl)
// — this tier has no map-seeded mode, so nothing here depends on the ISM-map
// readback dust's own mode-0 branch needs.
//
// A slot always writes a live record: unlike dust's survival-floor zeroing,
// buildArmParticleCloud never drops an individual placed sprite (its own
// weight-normalisation split just scales flux, never zeroes it) — see
// placeArmSpurCloud.wesl's identical "no survival filter on this tier" note.

import package::milkyWay::field::armRidge::ArmRec;
import package::milkyWay::field::armRidge::ArmRidgeGeometry;
import package::milkyWay::field::armRidge::armCrossSigma;
import package::milkyWay::field::armRidge::armExcessSurfaceShape;
import package::milkyWay::field::armRidge::armColor;
import package::milkyWay::field::records::FieldComponentRec;
import package::milkyWay::ismMap::clusteredDiscPlacement::genRand;
import package::milkyWay::ismMap::clusteredDiscPlacement::inverseCovarianceFromFrame;
import package::milkyWay::ismMap::clusteredDiscPlacement::buildClusteredDiscPlacementChild;
import package::milkyWay::ismMap::clusteredDiscPlacement::cdpRadialTilt;

// armParticleCloud.ts's own non-exported constants, mirrored verbatim (same
// "mirror, no parity test" treatment armRidge.wesl gives its own
// non-scalar-const mirrors).
const SIZE_MIN_RATIO: f32 = 0.35;
const SIZE_MAX_RATIO: f32 = 1.0;
const SPRITE_POLE_RATIO: f32 = 0.6;
// clusteredDiscPlacement.ts's own CHILD_POLE_RATIO (:33) — a FIXED constant
// the shared child-scatter tail applies for every mode/caller, not a
// per-tier tunable (placeDust.wesl's own local mirror of the SAME value,
// same "mirror, don't share a binding-adjacent module" treatment).
const CHILD_POLE_RATIO: f32 = 0.4;
// (2*PI)^1.5 — armParticleCloud.ts's TAU_ROOT3, the anisotropic Gaussian's
// own normalisation constant (placeDust.wesl/placeArmSpurCloud.wesl each
// mirror the same value independently rather than sharing an import — see
// placeArmSpurCloud.wesl's own doc for why: a bind group should never
// inherit an unrelated module's resources).
const TAU_ROOT3: f32 = 15.749609945722418;

// RNG_SLOT_CONTRACT (see clusteredDiscPlacement.wesl's own header): this
// shader owns (ARM_CLOUD_POP_COMPLEX, complexIndex) slots 0 (a dead armRoll
// draw) and 1 (the weighted arm pick) — buildClusteredDiscPlacementChild's
// mode 2u branch starts its own draws at slot 2 and never reads 0/1.
//
// ARM_CLOUD_POP_COMPLEX/ARM_CLOUD_POP_CHILD are this tier's OWN population
// tags, distinct from clusteredDiscPlacement.wesl's CDP_POP_COMPLEX/
// CDP_POP_CHILD (dust's own values) — genRand/genNormal are a pure function
// of (seed, pop, idx, slot) with no per-dispatch salt, and this shader
// shares 'params.seed' ('currentSeed()') with dust's own dispatch, so reusing
// dust's population tags here would draw bit-identical, CORRELATED values at
// every coincident (complexIndex, slot)/(i, slot) the two dispatches happen
// to share (fix-round-1 finding: this is exactly what the CPU original's own
// per-tier 'seed ^ TAG' salting existed to prevent — armParticleCloud.ts's
// own 'mulberry32(seed ^ 0x41524d43)', "ARMC"). Mirrors
// placeArmSpurCloud.wesl's own 'PLACE_SPUR_CLOUD_POP' decorrelation, ported
// here as TWO tags (complex + child) instead of one, since this tier —
// unlike spur — goes through the shared complex/child clumping loop.
//
// ARM_CLOUD_POP_CHILD is what the shared child-scatter tail
// (clusteredDiscPlacement.wesl's own popChild parameter) draws slots 0-5
// against for THIS shader's dispatch; this shader's own per-child size draw
// below continues that SAME stream at slot 6, exactly mirroring
// placeDust.wesl's own drawPayload slot (dust continues ITS OWN
// CDP_POP_CHILD stream the identical way).
const ARM_CLOUD_POP_COMPLEX: u32 = 0x41524D43u; // "ARMC" — armParticleCloud.ts's own seed-salt bytes, repurposed as a population tag
const ARM_CLOUD_POP_CHILD: u32 = 0x41524D63u; // "ARMc" — same 4 bytes, lowercase tail byte distinguishes it from ARM_CLOUD_POP_COMPLEX

// ArmCloudArmRecord — packArmCloudArmRecords.ts's own per-arm storage
// record: armRidge.wesl's ArmRec fields (phase..fadeRadius) plus
// spanStartLogR (this arm's own rendered-span start, GalaxyFieldArmRecord's
// own field — placeArmSpurCloud.wesl's SpurRecord carries the identical
// field for the identical reason) and weight (armAgeWeight(arm),
// precomputed in the packer — pickWeighted's own normaliser, mirroring
// packArmSpurCloudRecords.ts's "weight precomputed, not derived in-shader"
// contract).
struct ArmCloudArmRecord {
  phase: f32,
  pitch: f32,
  meanderAmp: f32,
  meanderFreq: f32,
  meanderPhase: f32,
  waveF1: f32,
  waveP1: f32,
  waveF2: f32,
  waveP2: f32,
  fadeRadius: f32,
  spanStartLogR: f32,
  weight: f32,
}

// PlaceArmCloudParams — SSoT for packPlaceArmCloudParams.ts. u32 fields
// travel as REAL u32s (placeDust.wesl's own precedent): 'seed' can exceed
// f32's 24-bit exact-integer range.
struct PlaceArmCloudParams {
  seed: u32,
  count: u32,
  armCount: u32,
  reservationOffset: u32,

  childrenPerComplex: u32,
  armWeightSum: f32,
  elongation: f32,
  sizeScale: f32,

  complexSpread: f32,
  sigmaZComplex: f32,
  widthScale: f32,
  excessScaleRatio: f32,

  hLight: f32,
  tiltRefRadius: f32,
  radialBias: f32,
  youngFraction: f32,

  discSigmaR: vec4<f32>,

  discWeightSum: f32,
  warpStrength: f32,
  warpTwist: f32,
  warpStartRadius: f32,

  outerRadius: f32,
  armStartRadius: f32,
  armInnerRampW: f32,
  armFullRadius: f32,

  waveAmount: f32,
  diskScaleLen: f32,
  cloudFlux: f32,
  _pad0: f32,
}

@group(0) @binding(0) var<uniform> params: PlaceArmCloudParams;
@group(0) @binding(1) var<storage, read> armRecords: array<ArmCloudArmRecord>;
// Dead pass-through: buildClusteredDiscPlacementChild's mode 0u/1u branches
// sample this, but this shader always dispatches mode 2u with hasOrientation
// hardcoded false below — armParticleCloud.ts's own buildClusteredDiscPlacement
// call never passes ismMapOrientation, so mode 2u's own branch never calls
// rotateFrameToOrientation at all (clusteredDiscPlacement.wesl's own doc).
// Bound to the engine's EXISTING orientation texture (no texture of its own
// created) purely to satisfy the shared function's fixed signature.
@group(0) @binding(2) var passThroughOrientationTex: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> comps: array<FieldComponentRec>;
// Dead pass-through, same reasoning as passThroughOrientationTex above: mode
// 0u's ('mapDensity') own CDF prefix-buffer parameter, required by
// buildClusteredDiscPlacementChild's fixed signature even though this shader
// always dispatches mode 2u. Bound to the SAME buffer as 'armRecords'
// (binding 1) reinterpreted as 'array<f32>' — no dummy buffer of its own.
@group(0) @binding(4) var<storage, read> passThroughPrefixBuf: array<f32>;

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

  let complexIndex = i / params.childrenPerComplex;

  // placeAnalyticComplex's own armRoll — dead value (armBias is hardcoded 1
  // for this tier's only caller, so the roll can never gate anything), drawn
  // anyway for structural parity with the CPU original (see this file's own
  // RNG_SLOT_CONTRACT above). '_' is WGSL's phony-assignment discard.
  _ = genRand(params.seed, ARM_CLOUD_POP_COMPLEX, complexIndex, 0u);

  // pickWeighted — armAgeWeight-biased arm pick, ported verbatim (the CPU's
  // own fallback of the last entry on a float-rounding miss is reproduced by
  // seeding armIndex there before the scan, placeArmSpurCloud.wesl's own
  // precedent).
  let pick = genRand(params.seed, ARM_CLOUD_POP_COMPLEX, complexIndex, 1u) * params.armWeightSum;
  var armIndex = params.armCount - 1u;
  var acc = 0.0;
  for (var j = 0u; j < params.armCount; j++) {
    acc += armRecords[j].weight;
    if (pick <= acc) {
      armIndex = j;
      break;
    }
  }
  let armRow = armRecords[armIndex];
  let armPicked = ArmRec(
    armRow.phase, armRow.pitch, armRow.meanderAmp, armRow.meanderFreq, armRow.meanderPhase,
    armRow.waveF1, armRow.waveP1, armRow.waveF2, armRow.waveP2, armRow.fadeRadius,
  );
  let armLogMin = armRow.spanStartLogR;
  let armLogMax = log(armRow.fadeRadius / geom.armStartRadius);

  // discSigmaR/discWeightSum are REAL inputs here, not dust-mode-1 filler:
  // mode 2u's own degenerate-arm-span fallback (cdpPlaceSmoothDiscSeed inside
  // clusteredDiscPlacement.wesl) reads them the same way mode 1u does.
  let placed = buildClusteredDiscPlacementChild(
    params.seed, i, params.childrenPerComplex, 2u,
    ARM_CLOUD_POP_COMPLEX, ARM_CLOUD_POP_CHILD,
    &passThroughPrefixBuf, 0.0, 0u, 0u, 0.0, 0.0,
    params.discSigmaR, params.discWeightSum,
    params.complexSpread, params.elongation, params.sigmaZComplex, CHILD_POLE_RATIO,
    geom,
    false, passThroughOrientationTex, 0u, 0u, 0.0, 1.0,
    armPicked, armLogMin, armLogMax,
    params.widthScale, params.tiltRefRadius, params.radialBias,
  );

  // drawPayload — armParticleCloud.ts's own per-child size draw (1 slot),
  // at the CHILD's own scattered position (radiusAtParticle), exactly
  // mirroring the CPU's post-scatter timing (placeDust.wesl's identical
  // "deterministic lookup at the child's own position" discipline).
  let particleRadius = length(vec2<f32>(placed.center.x, placed.center.z));
  let sizeFrac = SIZE_MIN_RATIO
    + genRand(params.seed, ARM_CLOUD_POP_CHILD, i, 6u) * (SIZE_MAX_RATIO - SIZE_MIN_RATIO);
  let radius = armCrossSigma(particleRadius, params.widthScale, geom) * sizeFrac * params.sizeScale;

  let sigAlong = radius * params.elongation;
  let sigAcross = radius;
  let sigPole = radius * SPRITE_POLE_RATIO;

  // Per-particle flux weight — armParticleCloud.ts:220-231, evaluated at the
  // FINAL scattered radius. Raw, unnormalised: NOT divided by weightSum
  // (Task 15 supplies that as a consume-time uniform, the same split
  // placeArmSpurCloud.wesl's own fluxWeight makes) — cloudFlux alone is
  // baked in here.
  let shape = armExcessSurfaceShape(particleRadius, params.hLight, params.excessScaleRatio, geom);
  let tilt = cdpRadialTilt(particleRadius, params.tiltRefRadius, params.radialBias);
  let fluxWeight = (radius * radius * shape) / tilt;
  let flux = params.cloudFlux * fluxWeight;
  let amplitude = flux / (TAU_ROOT3 * sigAlong * sigAcross * sigPole);

  let invCov = inverseCovarianceFromFrame(placed.frame, sigAlong, sigAcross, sigPole);

  // Per-particle radial cross-fade, matching the ridge chain's own —
  // armParticleCloud.ts:249's own comment: this tier renders alongside those
  // blobs and would otherwise sit at one flat hue.
  let color = armColor(params.youngFraction, particleRadius / params.outerRadius);

  var rec: FieldComponentRec;
  rec.invCovDiagonal = invCov.diag;
  rec.amplitude = amplitude;
  rec.invCovOffDiagonal = invCov.offDiag;
  rec.boundRadius = max(sigAlong, max(sigAcross, sigPole));
  rec.color = color;
  rec.textureWeight = 0.0;
  rec.center = placed.center;
  rec.starsWeight = 0.0;

  comps[params.reservationOffset + i] = rec;
}
