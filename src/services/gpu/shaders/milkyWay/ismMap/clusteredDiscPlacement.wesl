// milkyWay/ismMap/clusteredDiscPlacement.wesl — GPU port of
// clusteredDiscPlacement.ts's two-level complex/children sampler, including
// its 'analytic' (arm-lane) mode (2u below, Task 13's own addition — modes
// 0u/1u are Task 7's): one shared clumping loop rather than three copies,
// the plan's own reuse contract for buildClusteredDiscPlacementChild below.
//
// CPU draws from one serial mulberry32 stream where draw ORDER is
// load-bearing (clusteredDiscPlacement.ts's own header). A compute dispatch
// has no shared stream: every invocation instead derives its draws from a
// stateless (seed, population, index, slot) hash — generate.wesl:184-195's
// pcg4d/genRand/genNormal, ported verbatim below rather than imported: that
// file also declares v1-only module-scope bindings ('gen'/'outBuf') a v2
// placement shader has no business dragging in. A complex's own draws are
// keyed on its COMPLEX index (shared by every child in it, so every child
// independently recomputes the SAME seed point); a child's own draws are
// keyed on its own SLOT index — two populations so the two draw families can
// never alias each other even where their index ranges overlap.
//
// RNG_SLOT_CONTRACT: within one caller's own (popComplex, complexIndex) or
// (popChild, i) pair, slots never collide (mode 0u/1u/2u's own layouts
// below). ACROSS callers, genRand/genNormal are a PURE function of
// (seed, pop, idx, slot) with no per-dispatch salt — two callers sharing
// BOTH 'seed' and 'pop' would draw bit-identical values at every coincident
// (idx, slot), silently correlating two supposedly-independent stochastic
// populations (the CPU original avoided this with a per-tier 'seed ^ TAG'
// salt — dustParticleCloud.ts's "DUST" vs. armParticleCloud.ts's "ARMC").
// 'buildClusteredDiscPlacementChild' therefore takes 'popComplex'/'popChild'
// as CALLER-SUPPLIED parameters rather than hardcoding 'CDP_POP_COMPLEX'/
// 'CDP_POP_CHILD' internally: dust's own call site (placeDust.wesl) passes
// those two constants UNCHANGED (so its own output stays byte-identical —
// dust's placement is approved/pinned by the probe); arm cloud's call site
// (placeArmCloud.wesl) passes its OWN distinct pair
// (ARM_CLOUD_POP_COMPLEX/ARM_CLOUD_POP_CHILD, that file's own constants) so
// its draws are genuinely independent of dust's even where the two
// dispatches' 'complexIndex'/'i' ranges overlap — the same decorrelation
// placeArmSpurCloud.wesl's own 'PLACE_SPUR_CLOUD_POP' already gets by
// using a single tier-distinct population for its whole (complex-less) draw
// sequence.
//
// RNG_SLOT_CONTRACT (mode 2u, within whichever popComplex the caller
// passed): the weighted ARM PICK lives in the CALLER (placeArmCloud.wesl
// owns the arm-records storage buffer; this shared function takes none, so
// modes 0u/1u never need to bind one) at (popComplex, complexIndex) slots 0
// (a dead armRoll draw, kept only for structural parity with
// placeAnalyticComplex's own unconditional roll — armBias is hardcoded 1
// for this tier's only caller, so the roll can never gate anything) and 1
// (the pick itself). Mode 2u's OWN branch below never reads slots 0/1 — its
// arm-lane sub-branch starts at slot 2 (a running counter, the rejection
// loop's try count varies per invocation) and its smooth-disc fallback
// sub-branch uses ITS OWN slots 2-8 (mirroring mode 1u's 0-6, shifted by
// +2) — the two sub-branches are mutually exclusive per complexIndex, so
// they may share that range without colliding.

import package::milkyWay::field::armRidge::ArmRec;
import package::milkyWay::field::armRidge::ArmRidgeGeometry;
import package::milkyWay::field::armRidge::WarpSurfaceFrame;
import package::milkyWay::field::armRidge::warpHeight;
import package::milkyWay::field::armRidge::warpSurfaceFrame;
import package::milkyWay::field::armRidge::armRidgeFrameAt;
import package::milkyWay::field::armRidge::armFadeEnvelope;
import package::milkyWay::field::armRidge::armCrossSigma;
import package::milkyWay::ismMap::ismMapDustCdfScan::ismMapDustRingEdges;

// ---------------------------------------------------------------------------
// Stateless hash RNG
// ---------------------------------------------------------------------------

const CDP_PI: f32 = 3.14159265358979323846;
const CDP_INV_2POW32: f32 = 1.0 / 4294967296.0;

fn cdpPcg4d(vIn: vec4<u32>) -> vec4<u32> {
  var v = vIn * 1664525u + 1013904223u;
  v.x = v.x + v.y * v.w;
  v.y = v.y + v.z * v.x;
  v.z = v.z + v.x * v.y;
  v.w = v.w + v.y * v.z;
  v = v ^ (v >> vec4<u32>(16u));
  v.x = v.x + v.y * v.w;
  v.y = v.y + v.z * v.x;
  v.z = v.z + v.x * v.y;
  v.w = v.w + v.y * v.z;
  return v;
}

fn genRand(seed: u32, pop: u32, idx: u32, slot: u32) -> f32 {
  return f32(cdpPcg4d(vec4<u32>(seed, pop, idx, slot)).x) * CDP_INV_2POW32;
}

fn genNormal(seed: u32, pop: u32, idx: u32, slot: u32) -> f32 {
  let u1 = max(genRand(seed, pop, idx, slot), 1e-38);
  let u2 = genRand(seed, pop, idx, slot + 1u);
  return sqrt(-2.0 * log(u1)) * cos(2.0 * CDP_PI * u2);
}

// ---------------------------------------------------------------------------
// Orientation sampling + frame rotation
// ---------------------------------------------------------------------------

struct CloudFrame {
  along: vec3<f32>,
  across: vec3<f32>,
  pole: vec3<f32>,
}

// WGSL structs are nominally typed — warpSurfaceFrame's own WarpSurfaceFrame
// return (armRidge.wesl) is field-shape-identical to CloudFrame but not the
// SAME type, so a direct pass to rotateFrameToOrientation below fails to
// compile ("expected CloudFrame, got WarpSurfaceFrame") despite the shapes
// matching exactly.
fn cloudFrameFromWarpSurface(ws: WarpSurfaceFrame) -> CloudFrame {
  return CloudFrame(ws.along, ws.across, ws.pole);
}

// cdpRingIndexForSample/cdpAzIndexForAngle — ismMapRingIndexForSample.ts /
// ismMapAzIndexForAngle.ts ported verbatim: the nearest-texel FLOOR bucket
// sampleGalaxyIsmMap.ts/sampleIsmMapOrientation.ts both share. Deliberately
// NOT ismMapDustCdfScan.wesl's own round-to-nearest ismMapRingRadius inverse
// (that one backs the scan's AREA term, this backs a placement SAMPLE — the
// two CPU originals are different functions on purpose).
fn cdpRingIndexForSample(radius: f32, rings: u32, rMin: f32, rMax: f32) -> u32 {
  let clamped = clamp(radius, rMin, rMax);
  var lo = 0u;
  var hi = rings - 1u;
  loop {
    if (hi - lo <= 1u) { break; }
    let mid = (lo + hi) / 2u;
    let midRadius = rMin * pow(rMax / rMin, f32(mid) / f32(rings - 1u));
    if (midRadius <= clamped) { lo = mid; } else { hi = mid; }
  }
  return lo;
}

fn cdpAzIndexForAngle(angle: f32, az: u32) -> u32 {
  let twoPi = 2.0 * CDP_PI;
  let wrapped = ((angle % twoPi) + twoPi) % twoPi;
  return min(az - 1u, u32(floor((wrapped / twoPi) * f32(az))));
}

// cdpRingIndexForRadius — ismMapRingIndexForRadius.ts ported verbatim:
// ROUND-to-nearest ring index (as opposed to cdpRingIndexForSample's floor
// bucket above) — dustParticleCloud.ts:228-238's sampleMapTraits uses THIS
// one, not the floor bucket, for its ringMean divisor lookup. Mirror the
// CPU's own two-ring-semantics-in-one-ratio oddity exactly, don't fix it:
// callers pairing a floor-bucket numerator with a round-bucket divisor are
// porting a real (if odd) CPU behaviour, not a bug this file should paper
// over. 'round' ties-to-even vs. JS's Math.round ties-away-from-zero only
// disagrees on an exact half-integer boundary — unreachable for a
// continuously-scattered placement radius.
fn cdpRingIndexForRadius(radius: f32, rings: u32, rMin: f32, rMax: f32) -> u32 {
  if (rings <= 1u) { return 0u; }
  let t = log(radius / rMin) / log(rMax / rMin);
  let ring = i32(round(t * f32(rings - 1u)));
  return u32(clamp(ring, 0, i32(rings - 1u)));
}

// sampleOrientationNearest — sampleIsmMapOrientation.ts ported verbatim:
// nearest-texel read of the packed (cos2theta, sin2theta) double-angle
// vector (orientationTex's .xy — createIsmMapOrientation.ts). Returns
// (angle, coherence).
fn sampleOrientationNearest(
  orientationTex: texture_2d<f32>,
  radius: f32, angle: f32,
  rings: u32, az: u32, rMin: f32, rMax: f32,
) -> vec2<f32> {
  let ring = cdpRingIndexForSample(radius, rings, rMin, rMax);
  let azIdx = cdpAzIndexForAngle(angle, az);
  let texel = textureLoad(orientationTex, vec2<i32>(i32(azIdx), i32(ring)), 0);
  let cos2 = texel.x;
  let sin2 = texel.y;
  return vec2<f32>(0.5 * atan2(sin2, cos2), length(vec2<f32>(cos2, sin2)));
}

// rotateFrameToOrientation — clusteredDiscPlacement.ts's own function,
// ported verbatim (vector form of its scalar along/across blend). 'hasOrientation'
// stands in for the CPU's 'orientation: ... | null' — WGSL has no null.
fn rotateFrameToOrientation(
  frame: CloudFrame, radius: f32, angle: f32, geom: ArmRidgeGeometry,
  hasOrientation: bool, orientationTex: texture_2d<f32>,
  rings: u32, az: u32, rMin: f32, rMax: f32,
) -> CloudFrame {
  if (!hasOrientation) { return frame; }
  let sample = sampleOrientationNearest(orientationTex, radius, angle, rings, az, rMin, rMax);
  let coherence = sample.y;
  if (coherence <= 0.0) { return frame; }

  let refFrame = warpSurfaceFrame(radius, angle, geom);
  let currentAngle = atan2(dot(frame.along, refFrame.across), dot(frame.along, refFrame.along));
  // Wrap the DIFFERENCE (a filament orientation has no head/tail) — see the
  // CPU original's own header for why wrapping the absolute angles instead
  // would land on a bogus partial rotation for a +80/-100deg pair.
  let rawDelta = sample.x - currentAngle;
  let delta = coherence * (rawDelta - CDP_PI * round(rawDelta / CDP_PI));

  let rot90 = cross(frame.pole, frame.along);
  let s = select(-1.0, 1.0, dot(frame.across, rot90) >= 0.0);
  let cosd = cos(delta);
  let sind = sin(delta) * s;
  let along = frame.along * cosd + frame.across * sind;
  let across = frame.across * cosd - frame.along * sind;
  return CloudFrame(along, across, frame.pole);
}

// inverseCovarianceFromFrame — inverseCovarianceFromFrame.ts ported
// verbatim: M = sum_i u_i u_i^T / sigma_i^2 over an ARBITRARY orthonormal
// frame. Shared here (not placeDust.wesl-local) since Task 13's arm-cloud
// records need the identical along/across/pole -> invCov reduction.
struct InvCov {
  diag: vec3<f32>,
  offDiag: vec3<f32>,
}

fn inverseCovarianceFromFrame(frame: CloudFrame, sigAlong: f32, sigAcross: f32, sigPole: f32) -> InvCov {
  let kA = 1.0 / (sigAlong * sigAlong);
  let kC = 1.0 / (sigAcross * sigAcross);
  let kP = 1.0 / (sigPole * sigPole);
  let u0 = frame.along;
  let u1 = frame.across;
  let u2 = frame.pole;
  let m00 = kA * u0.x * u0.x + kC * u1.x * u1.x + kP * u2.x * u2.x;
  let m11 = kA * u0.y * u0.y + kC * u1.y * u1.y + kP * u2.y * u2.y;
  let m22 = kA * u0.z * u0.z + kC * u1.z * u1.z + kP * u2.z * u2.z;
  let m01 = kA * u0.x * u0.y + kC * u1.x * u1.y + kP * u2.x * u2.y;
  let m02 = kA * u0.x * u0.z + kC * u1.x * u1.z + kP * u2.x * u2.z;
  let m12 = kA * u0.y * u0.z + kC * u1.y * u1.z + kP * u2.y * u2.z;
  return InvCov(vec3<f32>(m00, m11, m22), vec3<f32>(m01, m02, m12));
}

// ---------------------------------------------------------------------------
// The clumping sampler itself
// ---------------------------------------------------------------------------

struct PlacedChild {
  center: vec3<f32>,
  frame: CloudFrame,
}

// Distinct hash "populations" for complex-level vs. child-level draws — see
// this file's own header for why the two must never share one tag. These
// two are dust's OWN concrete values (placeDust.wesl passes them,
// unchanged, as buildClusteredDiscPlacementChild's popComplex/popChild
// arguments) — kept exported/importable rather than dust inlining its own
// copies, so "dust's population" stays this ONE pair, not a duplicate.
const CDP_POP_COMPLEX: u32 = 0xC0442u;
const CDP_POP_CHILD: u32 = 0xC41Du;

// discSurfaceFit.ts's DISC_SURFACE_WEIGHTS, mirrored (not parity-tested —
// same treatment armRidge.wesl gives its own non-scalar-const mirrors):
// pickWeighted's fixed pick-probability per smooth-disc radial component.
const CDP_DISC_SURFACE_WEIGHTS: vec4<f32> = vec4<f32>(0.1667, 0.3065, 0.2131, 0.1365);

// clusteredDiscPlacement.ts's own ARM_FADE_REJECTION_TRIES (:30), mirrored:
// mode 2u's arm-lane rejection-loop bound.
const CDP_ARM_FADE_REJECTION_TRIES: u32 = 24u;

// radialTilt — armParticleCloud.ts's own helper (:149-152), ported fresh:
// no WGSL home elsewhere (armRidge.wesl's ridge vocabulary has no bias/tilt
// concept, and only mode 2u's placement density plus placeArmCloud.wesl's
// own flux-weight cancellation ever read it).
const CDP_TILT_FLOOR: f32 = 0.05;
fn cdpRadialTilt(radius: f32, referenceRadius: f32, bias: f32) -> f32 {
  if (bias <= 0.0) { return 1.0; }
  return max(CDP_TILT_FLOOR, pow(max(radius, 0.0) / referenceRadius, bias));
}

// cdpPlaceSmoothDiscSeed — clusteredDiscPlacement.ts's placeSmoothDiscComplex,
// the RAW seed point (no frame/orientation — callers differ on whether they
// rotate it). Own 'slotBase' rather than hardcoded 0: mode 1u calls this at
// 0, mode 2u's degenerate-arm fallback at 2 (see this file's own
// RNG_SLOT_CONTRACT) — one function, two non-colliding slot ranges, instead
// of two copies of the same pick/genNormal sequence. 'popComplex' is the
// CALLER's own complex-level population (this file's own header) — threaded
// through rather than hardcoded, so this helper stays tier-agnostic.
struct SmoothDiscSeed {
  center: vec3<f32>,
  radius: f32,
  angle: f32,
}

fn cdpPlaceSmoothDiscSeed(
  seed: u32, popComplex: u32, complexIndex: u32, slotBase: u32,
  discSigmaR: vec4<f32>, discWeightSum: f32, sigmaZComplex: f32,
) -> SmoothDiscSeed {
  let pick = genRand(seed, popComplex, complexIndex, slotBase) * discWeightSum;
  var k = 3u;
  var acc = 0.0;
  for (var j = 0u; j < 4u; j++) {
    acc += CDP_DISC_SURFACE_WEIGHTS[j];
    if (pick <= acc) { k = j; break; }
  }
  let sigmaR = discSigmaR[k];
  let x = genNormal(seed, popComplex, complexIndex, slotBase + 1u) * sigmaR;
  let z = genNormal(seed, popComplex, complexIndex, slotBase + 3u) * sigmaR;
  let y = genNormal(seed, popComplex, complexIndex, slotBase + 5u) * sigmaZComplex;
  var out: SmoothDiscSeed;
  out.center = vec3<f32>(x, y, z);
  out.radius = length(vec2<f32>(x, z));
  out.angle = atan2(z, x);
  return out;
}

// buildClusteredDiscPlacementChild — clusteredDiscPlacement.ts's
// buildClusteredDiscPlacement, restructured for one-invocation-per-child
// parallel dispatch: 'i' is this child's own SLOT index (0..count), not a
// loop counter. complexIndex = i / childrenPerComplex reproduces the CPU's
// own complex grouping exactly — only the LAST complex is ever short (the
// CPU's own 'childCount = min(childrenPerComplex, count - placed)'), so
// floor division alone recovers the same grouping with no extra clamp.
//
// mode 0u = 'mapDensity' (dust's map-seeded path), 1u = 'smoothDisc' (dust's
// no-map fallback), 2u = 'analytic' (the arm cloud's arm-lane/smooth-disc
// roll — Task 13).
fn buildClusteredDiscPlacementChild(
  seed: u32, i: u32, childrenPerComplex: u32, mode: u32,
  // Caller-owned hash populations (this file's own RNG_SLOT_CONTRACT) — NOT
  // hardcoded here, so two callers sharing 'seed' never draw correlated
  // values: dust's own call site passes CDP_POP_COMPLEX/CDP_POP_CHILD
  // (unchanged, so its output stays byte-identical); arm cloud's passes its
  // own distinct pair.
  popComplex: u32, popChild: u32,
  // mode 0u (mapDensity) inputs — Task 6's CDF prefix buffer.
  prefixBuf: ptr<storage, array<f32>, read>, cdfTotal: f32,
  cdfRings: u32, cdfAz: u32, cdfRMin: f32, cdfRMax: f32,
  // mode 1u (smoothDisc) inputs.
  discSigmaR: vec4<f32>, discWeightSum: f32,
  // shared child-scatter inputs.
  complexSpread: f32, elongation: f32, sigmaZComplex: f32, childPoleRatio: f32,
  geom: ArmRidgeGeometry,
  hasOrientation: bool, orientationTex: texture_2d<f32>,
  orientRings: u32, orientAz: u32, orientRMin: f32, orientRMax: f32,
  // mode 2u ('analytic') inputs — the CALLER's own weighted arm pick
  // (RNG_SLOT_CONTRACT, this file's own header): armPicked/armLogMin/armLogMax
  // are that pick's result already keyed to this child's complexIndex.
  // armLogMax > armLogMin gates the arm-lane branch, matching
  // placeArmLaneComplex's own null-on-degenerate-span return. Modes 0u/1u
  // never read these — dust's own call site passes harmless zeros.
  armPicked: ArmRec, armLogMin: f32, armLogMax: f32,
  armWidthScale: f32, armTiltRefRadius: f32, armRadialBias: f32,
) -> PlacedChild {
  let complexIndex = i / childrenPerComplex;

  var center: vec3<f32>;
  var frame: CloudFrame;
  var warped = false; // true only for mode 2u's arm-lane sub-branch

  if (mode == 0u) {
    // placeMapDensityComplex — sampleIsmMapDustCdf.ts:20-46 ported verbatim
    // (upperBound binary search, 3 draws), then the complex's y offset
    // (genNormal, 2 draws) — 5 slots total, SAME order as the CPU.
    let u = genRand(seed, popComplex, complexIndex, 0u) * cdfTotal;
    var lo = 0u;
    var hi = cdfRings * cdfAz - 1u;
    loop {
      if (lo >= hi) { break; }
      let mid = (lo + hi) / 2u;
      if ((*prefixBuf)[mid] > u) { hi = mid; } else { lo = mid + 1u; }
    }
    let index = lo;
    let ring = index / cdfAz;
    let azIdx = index % cdfAz;
    let dTheta = 2.0 * CDP_PI / f32(cdfAz);
    let angle = f32(azIdx) * dTheta + genRand(seed, popComplex, complexIndex, 1u) * dTheta;
    let edges = ismMapDustRingEdges(ring, cdfRings, cdfRMin, cdfRMax);
    let radius = sqrt(
      edges.x * edges.x
        + genRand(seed, popComplex, complexIndex, 2u) * (edges.y * edges.y - edges.x * edges.x),
    );
    let y = genNormal(seed, popComplex, complexIndex, 3u) * sigmaZComplex;
    center = vec3<f32>(cos(angle) * radius, y, sin(angle) * radius);
    frame = rotateFrameToOrientation(
      cloudFrameFromWarpSurface(warpSurfaceFrame(radius, angle, geom)), radius, angle, geom,
      hasOrientation, orientationTex, orientRings, orientAz, orientRMin, orientRMax,
    );
  } else if (mode == 1u) {
    let seedPt = cdpPlaceSmoothDiscSeed(seed, popComplex, complexIndex, 0u, discSigmaR, discWeightSum, sigmaZComplex);
    center = seedPt.center;
    frame = rotateFrameToOrientation(
      cloudFrameFromWarpSurface(warpSurfaceFrame(seedPt.radius, seedPt.angle, geom)),
      seedPt.radius, seedPt.angle, geom,
      hasOrientation, orientationTex, orientRings, orientAz, orientRMin, orientRMax,
    );
  } else {
    // mode 2u ('analytic') — placeAnalyticComplex. armParticleCloud.ts's
    // buildClusteredDiscPlacement call never passes ismMapOrientation (this
    // tier has no map-seeded mode), so rotateFrameToOrientation would always
    // be a no-op here — skipped outright rather than threading a dead
    // orientationTex read through it.
    let validLane = armLogMax > armLogMin;
    if (validLane) {
      // placeArmLaneComplex — rejection-sample a log-radius against the
      // fade envelope x radial tilt. Own running slot counter starting at 2
      // (the caller's own armRoll/pick draws own slots 0/1 — this file's
      // header) since the try count varies per invocation.
      var slot = 2u;
      var logR = armLogMin;
      var radius = geom.armStartRadius;
      for (var tries = 0u; tries < CDP_ARM_FADE_REJECTION_TRIES; tries++) {
        logR = armLogMin + genRand(seed, popComplex, complexIndex, slot) * (armLogMax - armLogMin);
        slot += 1u;
        radius = geom.armStartRadius * exp(logR);
        let accept = genRand(seed, popComplex, complexIndex, slot)
          < armFadeEnvelope(radius, armPicked, geom) * cdpRadialTilt(radius, armTiltRefRadius, armRadialBias);
        slot += 1u;
        if (accept) { break; }
      }
      let laneFrame = armRidgeFrameAt(logR, armPicked, geom);
      let laneSpread = armCrossSigma(radius, armWidthScale, geom);
      let acrossOffset = genNormal(seed, popComplex, complexIndex, slot) * laneSpread;
      slot += 2u;
      let poleOffset = genNormal(seed, popComplex, complexIndex, slot) * sigmaZComplex;
      center = laneFrame.point + laneFrame.across * acrossOffset + laneFrame.pole * poleOffset;
      frame = CloudFrame(laneFrame.along, laneFrame.across, laneFrame.pole);
      warped = true;
    } else {
      // placeSmoothDiscComplex fallback — degenerate arm span. Own slot
      // range (2..8, mirroring mode 1u's 0..6 shifted by +2) so it can never
      // collide with the arm-lane sub-branch above even though the two are
      // mutually exclusive per complexIndex.
      let seedPt = cdpPlaceSmoothDiscSeed(seed, popComplex, complexIndex, 2u, discSigmaR, discWeightSum, sigmaZComplex);
      center = seedPt.center;
      frame = cloudFrameFromWarpSurface(warpSurfaceFrame(seedPt.radius, seedPt.angle, geom));
    }
  }

  // Child scatter — drawn even at childSpread == 0 (a lone child at
  // clumpiness 0): only the MAGNITUDE collapses to zero, not the draw
  // itself, matching the CPU's own "rng order is load-bearing" discipline
  // (moot for a slot-hash RNG's own determinism, kept for structural parity
  // with the CPU original this is a port of).
  let childSpread = select(0.0, complexSpread, childrenPerComplex > 1u);
  let along = genNormal(seed, popChild, i, 0u) * childSpread * elongation;
  let across = genNormal(seed, popChild, i, 2u) * childSpread;
  let pole = genNormal(seed, popChild, i, 4u) * childSpread * childPoleRatio;
  let x = center.x + frame.along.x * along + frame.across.x * across + frame.pole.x * pole;
  let z = center.z + frame.along.z * along + frame.across.z * across + frame.pole.z * pole;
  let yFlat = center.y + frame.along.y * along + frame.across.y * across + frame.pole.y * pole;
  // Both modes 0u/1u seed unwarped ('placement.warped' is false for
  // smoothDisc/mapDensity on the CPU side too) — the child's OWN (x, z) then
  // bends with the disc, matching the CPU's cross-tier warp contract.
  let y = select(yFlat + warpHeight(length(vec2<f32>(x, z)), atan2(z, x), geom), yFlat, warped);

  var out: PlacedChild;
  out.center = vec3<f32>(x, y, z);
  out.frame = frame;
  return out;
}
