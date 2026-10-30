// points/pooledFields.wesl — the WGSL twin of derivePointRecord (utils/galaxy/) over
// an octree record's wire values: pooledVertex derives the PerVertex fields the flat
// interleave bakes on the CPU. pooledFields.parity.test.ts runs these functions
// against the TS helpers, so a change to either side must land on both.
// The record's band magnitude is bandMagOfBakedAbsMag(absMag, d, magOffset), and
// derivePointRecord adds magOffset back, so the offset cancels out of 'magnitude'
// and only the physical absolute magnitude (absMag - magOffset) reaches 'sbAmp'.

// SDSS_TARGET_MEAN_MAG: what a record at the observer (no distance modulus) draws at.
const TARGET_MEAN_MAG: f32 = 18.0;
const LOG10_OF_2: f32 = 0.30102999566398120;
const DEG_TO_RAD: f32 = 0.017453292519943295;
// paddedRadiusMpc: half the diameter, times the thumbnail padding, kpc to Mpc.
const RADIUS_MPC_PER_KPC: f32 = 0.002;
// galaxySbAmp's reference diameter and float-safety ceiling.
const SB_REF_DIAMETER_KPC: f32 = 30.0;
const SB_AMP_MAX: f32 = 100000.0;

fn pooledMagnitude(absMag: f32, distMpc: f32) -> f32 {
  return select(TARGET_MEAN_MAG, absMag + 5.0 * LOG10_OF_2 * log2(distMpc) + 25.0, distMpc > 0.0);
}

// Negated: PA runs east of north, UV y points down, and rotating the UV inverts the ellipse's turn.
fn pooledPaCosSin(paDeg: f32) -> vec2<f32> {
  let paRad = -paDeg * DEG_TO_RAD;
  return vec2<f32>(cos(paRad), sin(paRad));
}

// diameterKpc = 10^logSize is never 0, so paddedRadiusMpc's missing-diameter floor never applies.
fn pooledRadiusMpc(diameterKpc: f32, diameterIsFallback: bool) -> f32 {
  let padded = diameterKpc * RADIUS_MPC_PER_KPC;
  return select(padded, -padded, diameterIsFallback);
}

fn pooledSbAmp(physicalAbsMag: f32, medianAbsMag: f32, diameterKpc: f32) -> f32 {
  let diamRatio = diameterKpc / SB_REF_DIAMETER_KPC;
  let lumRel = pow(10.0, -0.4 * (physicalAbsMag - medianAbsMag));
  return clamp(lumRel / (diamRatio * diamRatio), 0.0, SB_AMP_MAX);
}
