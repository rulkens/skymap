// milkyWay/ismMap/placeDigVeil.wesl — GPU port of hiiRegions.ts's
// buildDigVeil (:532-644), one invocation per particle SLOT (DIG_MAX_COUNT
// = 1440 ceiling, hiiRegions.ts:108). The CPU still decides slot COUNT
// (computeDigVeilBudget.ts's own budget math, same 'reservation survives,
// placement doesn't' cut Task 7 made for dust); this shader decides slot
// CONTENT, including the map-usability gate itself (see 'usesMap' below) —
// nothing here depends on a CPU ismMap readback.
//
// NOT a mode of buildClusteredDiscPlacementChild (clusteredDiscPlacement.wesl):
// DIG's complex seed has no y-offset draw, its child scatter uses its OWN
// area-preserving elongation convention (sqrt-split, not that file's
// straight along-only multiply) and adds an extraplanar height draw plus a
// per-child sigma draw neither dust nor arm cloud has. Duplicating the ~10
// lines of the CDF binary search here (rather than reaching into that
// already-reviewed/pinned file) keeps this shader's own bind group from
// risking a dust/arm-cloud regression — same 'own shader, own mirrored
// constants' discipline placeArmSpurCloud.wesl already establishes for
// TAU_ROOT3 et al.
//
// Every reserved slot is always live when the map is usable (buildDigVeil's
// own loop has no per-child survival filter, unlike dust) — the only
// zero-amplitude case is the whole-dispatch 'no usable map' gate below,
// mirroring dust's own usesMapDensity discipline: the CDF's prefix buffer
// can be STALE (left over from the last fluid run) after a generator flip
// to 'none', so 'generatorIsFluid' is checked ALONGSIDE 'total > 0', not
// instead of it.

import package::milkyWay::field::armRidge::ArmRidgeGeometry;
import package::milkyWay::field::armRidge::WarpSurfaceFrame;
import package::milkyWay::field::armRidge::warpHeight;
import package::milkyWay::field::armRidge::warpSurfaceFrame;
import package::milkyWay::field::records::FieldComponentRec;
import package::milkyWay::ismMap::clusteredDiscPlacement::genRand;
import package::milkyWay::ismMap::clusteredDiscPlacement::genNormal;
import package::milkyWay::ismMap::ismMapDustCdfScan::ismMapDustRingEdges;

const DIG_PI: f32 = 3.14159265358979323846;
// The DIG-veil analogue of placeDust.wesl/placeArmCloud.wesl's own
// CHILD_POLE_RATIO (formerly clusteredDiscPlacement.ts's, deleted Task 16) —
// hiiRegions.ts's DIG_CHILD_POLE_RATIO (:112), this tier's own fixed
// constant, mirrored (not shared) like every other placement shader's own
// pole-ratio constant.
const DIG_CHILD_POLE_RATIO: f32 = 0.4;
// (2*PI)^1.5 — hiiRegions.ts's TAU_ROOT3 (:114), the isotropic Gaussian's
// own normalisation constant.
const TAU_ROOT3: f32 = 15.749609945722418;

// RNG_SLOT_CONTRACT: two DISTINCT population tags, complex-level and
// child-level, matching clusteredDiscPlacement.wesl's own header discipline
// (never share a (seed, pop) pair with another tier's own population) —
// "DIGC"/"DIGc", the same uppercase/lowercase-tail-byte convention
// placeArmCloud.wesl's ARM_CLOUD_POP_COMPLEX/CHILD already use.
//
// Complex-level slots (DIG_VEIL_POP_COMPLEX, complexIndex): 0 = CDF u
// (upperBound pick), 1 = angle jitter, 2 = radius jitter — placeDigMapComplex's
// own 3 draws (hiiRegions.ts:389, sampleIsmMapDustCdf.ts) — then 3 =
// scatterAxesForCoherence's own rotation angle (hiiRegions.ts:486). NO
// y-offset draw here (mode 0's own extra 2 slots in clusteredDiscPlacement.wesl
// have no DIG counterpart — placeDigMapComplex never draws one).
//
// Child-level slots (DIG_VEIL_POP_CHILD, i): 0-1/2-3/4-5 = offAlong/
// offAcross/offPole (genNormal each, hiiRegions.ts:608-610), 6-7 = the
// extraplanar height draw (hiiRegions.ts:631), 8 = the per-child sigma draw
// (hiiRegions.ts:632) — 9 slots, matching the CPU's 4 gaussians + 1 uniform.
const DIG_VEIL_POP_COMPLEX: u32 = 0x44494743u; // "DIGC"
const DIG_VEIL_POP_CHILD: u32 = 0x44494763u; // "DIGc"

// PlaceDigVeilParams — SSoT for packPlaceDigVeilParams.ts. u32 fields travel
// as REAL u32s (placeDust.wesl's own precedent): 'seed' can exceed f32's
// 24-bit exact-integer range.
struct PlaceDigVeilParams {
  seed: u32,
  count: u32,
  childrenPerComplex: u32,
  reservationOffset: u32,

  generatorIsFluid: u32,
  cdfRings: u32,
  cdfAz: u32,
  _padU0: u32,

  cdfRMin: f32,
  cdfRMax: f32,
  complexSpread: f32,
  elongation: f32,

  coherence: f32,
  amplitudeBase: f32,
  scaleHeight: f32,
  sigmaMin: f32,

  sigmaMax: f32,
  textureWeight: f32,
  warpStrength: f32,
  warpTwist: f32,

  warpStartRadius: f32,
  outerRadius: f32,
  _pad1: f32,
  _pad2: f32,

  color: vec3<f32>,
  _pad3: f32,
}

@group(0) @binding(0) var<uniform> params: PlaceDigVeilParams;
@group(0) @binding(1) var<storage, read> prefixBuf: array<f32>;
@group(0) @binding(2) var<storage, read_write> comps: array<FieldComponentRec>;

@compute @workgroup_size(256)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.count) {
    return;
  }

  let geom = ArmRidgeGeometry(
    0.0, 0.0, 0.0, 0.0, 0.0,
    params.warpStrength, params.warpTwist, params.warpStartRadius, params.outerRadius,
  );

  let complexIndex = i / params.childrenPerComplex;

  // placeDigMapComplex — sampleIsmMapDustCdf.ts ported verbatim: upperBound
  // binary search over the packed (arm-biased) prefix sum, then jittered
  // uniform-in-angle / area-uniform-in-radius inside the picked texel.
  let cdfLen = params.cdfRings * params.cdfAz;
  let total = prefixBuf[cdfLen - 1u];
  let u = genRand(params.seed, DIG_VEIL_POP_COMPLEX, complexIndex, 0u) * total;
  var lo = 0u;
  var hi = cdfLen - 1u;
  loop {
    if (lo >= hi) { break; }
    let mid = (lo + hi) / 2u;
    if (prefixBuf[mid] > u) { hi = mid; } else { lo = mid + 1u; }
  }
  let index = lo;
  let ring = index / params.cdfAz;
  let azIdx = index % params.cdfAz;
  let dTheta = 2.0 * DIG_PI / f32(params.cdfAz);
  let angle = f32(azIdx) * dTheta
    + genRand(params.seed, DIG_VEIL_POP_COMPLEX, complexIndex, 1u) * dTheta;
  let edges = ismMapDustRingEdges(ring, params.cdfRings, params.cdfRMin, params.cdfRMax);
  let radius = sqrt(
    edges.x * edges.x
      + genRand(params.seed, DIG_VEIL_POP_COMPLEX, complexIndex, 2u) * (edges.y * edges.y - edges.x * edges.x),
  );

  let point = vec3<f32>(cos(angle) * radius, 0.0, sin(angle) * radius);
  let surf = warpSurfaceFrame(radius, angle, geom);

  // scatterAxesForCoherence — rotate the seed frame's in-plane axes toward a
  // fresh random direction; 'pole' never moves (hiiRegions.ts's own doc,
  // :472-501). Drawn unconditionally so the draw order never shifts with
  // the coherence knob, mirroring the CPU's own discipline.
  let theta = (1.0 - params.coherence)
    * (genRand(params.seed, DIG_VEIL_POP_COMPLEX, complexIndex, 3u) * 2.0 * DIG_PI - DIG_PI);
  let cosT = cos(theta);
  let sinT = sin(theta);
  let axisAlong = surf.along * cosT + surf.across * sinT;
  let axisAcross = surf.across * cosT - surf.along * sinT;

  // Child scatter — hiiRegions.ts:607-632. This tier's OWN elongation
  // convention (sqrt-split, area-preserving on the scatter footprint,
  // mirroring placeDust.wesl's own area-preserving aspect, formerly
  // dustParticleCloud.ts's S3 aspect before Task 16 deleted that body) — NOT
  // clusteredDiscPlacement.wesl's shared child-scatter tail, which applies
  // elongation straight to 'along' alone; ported as its own algorithm, not
  // reconciled with that file's convention.
  let offAlong = genNormal(params.seed, DIG_VEIL_POP_CHILD, i, 0u) * params.complexSpread * sqrt(params.elongation);
  let offAcross = genNormal(params.seed, DIG_VEIL_POP_CHILD, i, 2u) * params.complexSpread / sqrt(params.elongation);
  let offPole = genNormal(params.seed, DIG_VEIL_POP_CHILD, i, 4u) * params.complexSpread * DIG_CHILD_POLE_RATIO;

  let x = point.x + axisAlong.x * offAlong + axisAcross.x * offAcross + surf.pole.x * offPole;
  let z = point.z + axisAlong.z * offAlong + axisAcross.z * offAcross + surf.pole.z * offPole;
  let yFlat = point.y + axisAlong.y * offAlong + axisAcross.y * offAcross + surf.pole.y * offPole;
  // Warp lift at THIS CHILD's own (x, z) — 'point' sits at the flat
  // reference height, never lifted (placeDigMapComplex's own doc).
  let y = yFlat + warpHeight(length(vec2<f32>(x, z)), atan2(z, x), geom);

  // Extraplanar scatter on top of the in-plane placement above — DIG stands
  // thicker off the disc than a single HII shell (Haffner+2009 review,
  // hiiRegions.ts's own doc).
  let height = y + genNormal(params.seed, DIG_VEIL_POP_CHILD, i, 6u) * params.scaleHeight;
  let sigma = params.sigmaMin
    + (params.sigmaMax - params.sigmaMin) * genRand(params.seed, DIG_VEIL_POP_CHILD, i, 8u);

  // usesMap — the whole-dispatch liveness gate (this file's own header):
  // 'generatorIsFluid' guards against a STALE prefixBuf surviving a
  // generator flip to 'none' (the buffer isn't re-scanned off that path —
  // see createGalaxyModel.ts's dispatchDigCdfScan), 'total > 0.0' guards
  // against a genuinely empty (but fresh) activity channel — either mirrors
  // buildDigVeil's own '!ismMap || !(cdf.total > 0)' early return, moved
  // in-shader per the amplitude-as-liveness discipline (every reserved slot
  // is still written, never skipped).
  let usesMap = params.generatorIsFluid != 0u && total > 0.0;

  // Isotropic blob: sigma equal on all three axes, so
  // inverseCovarianceFromFrame(ISO_FRAME, sigma, sigma, sigma) collapses to
  // a bare 1/sigma^2 diagonal with zero off-diagonal for ANY orthonormal
  // frame (hiiRegions.ts's own ISO_FRAME, :117) — computed directly rather
  // than routing through that general helper for a trivial input.
  let invSigma2 = 1.0 / (sigma * sigma);
  let amplitude = select(0.0, params.amplitudeBase / (TAU_ROOT3 * sigma * sigma * sigma), usesMap);

  var rec: FieldComponentRec;
  rec.invCovDiagonal = vec3<f32>(invSigma2, invSigma2, invSigma2);
  rec.amplitude = amplitude;
  rec.invCovOffDiagonal = vec3<f32>(0.0, 0.0, 0.0);
  rec.boundRadius = sigma;
  rec.color = params.color;
  rec.textureWeight = params.textureWeight;
  rec.center = vec3<f32>(x, height, z);
  rec.starsWeight = 0.0;

  comps[params.reservationOffset + i] = rec;
}
