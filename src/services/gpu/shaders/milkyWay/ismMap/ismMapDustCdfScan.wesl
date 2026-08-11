// milkyWay/ismMap/ismMapDustCdfScan.wesl — GPU replacement for
// buildIsmMapDustCdf.ts's CPU prefix sum, area-weighted per that file's
// annular-sector term (:54). csRingScan workgroup-scans each ring's own
// LOCAL running mass into prefixBuf + writes the ring's total; csFold-
// RingOffsets turns those totals into a running cross-ring offset (one
// thread, sequential, the SAME order buildIsmMapDustCdf.ts's outer loop
// carries its own running sum through); csApplyRingOffsets adds that
// offset back over the full grid. Per-texel weight is a small uniform
// table, not a bare channel read — dust density (Task 7) is a channel
// dot; arm-biased activity (Task 8) reweights by a packed per-(ring,arm)
// envelope mirroring buildArmProximityEnvelope/armBiasedDensity (hiiRegions.ts:484-539).

import package::milkyWay::ismMap::ismMapShear::ismMapRingRadius;

const ISM_MAP_CDF_SCAN_WORKGROUP_SIZE: u32 = 256u;
const ISM_MAP_CDF_TWO_PI: f32 = 6.28318530717959;

// 6 scalar members past the vec4 (40 raw bytes) — the uniform address
// space rounds the struct up to 48 (a multiple of its own 16-byte
// alignment) with no named pad field needed, same as ismMapFluidStep.wesl's
// IsmMapFluidConstants.
struct IsmMapCdfParams {
  channelWeights: vec4<f32>, // dot with (gas, stars, activity, dust)
  rMin: f32,
  rMax: f32,
  rings: f32,
  az: f32,
  armBias: f32,
  armCount: f32,
}

// Packed per-(ring,arm) envelope entry — buildArmProximityEnvelope's
// 'refresh(radius)' output, uploaded rather than re-derived: this shader
// evaluates the closure's RESULT, not its cachedRadius/refresh control flow.
struct IsmMapCdfArmEnvelopeEntry {
  ridgeAngle: f32,
  weight: f32,
  invSigma: f32,
}

@group(0) @binding(0) var ismMapTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: IsmMapCdfParams;
@group(0) @binding(2) var<storage, read> armEnvelopeBuf: array<IsmMapCdfArmEnvelopeEntry>;
@group(0) @binding(3) var<storage, read_write> prefixBuf: array<f32>;
@group(0) @binding(4) var<storage, read_write> ringTotalsBuf: array<f32>;

// ismMapDustRingEdges — WGSL mirror of ismMapDustRingEdges.ts: ring's
// inner/outer radius, bisected against its neighbours at their geometric
// mean. Exported so Tasks 7/8's own radius-jitter draw within a picked bin
// can import it rather than re-deriving, same sharing discipline the CPU
// original documents between buildIsmMapDustCdf and sampleIsmMapDustCdf.
fn ismMapDustRingEdges(ring: u32, rings: u32, rMin: f32, rMax: f32) -> vec2<f32> {
  let center = ismMapRingRadius(ring, rings, rMin, rMax);
  var rInner = rMin;
  if (ring != 0u) {
    rInner = sqrt(ismMapRingRadius(ring - 1u, rings, rMin, rMax) * center);
  }
  var rOuter = rMax;
  if (ring != rings - 1u) {
    rOuter = sqrt(center * ismMapRingRadius(ring + 1u, rings, rMin, rMax));
  }
  return vec2<f32>(rInner, rOuter);
}

// evalWeight — base channel weight, optionally reweighted toward the
// nearest arm ridge (armBiasedDensity, hiiRegions.ts:527-539): armBias<=0
// is the ONLY short-circuit (a dust-weight caller pays nothing for it).
// armCount==0u is NOT special-cased — the loop below just runs zero times,
// leaving envelope at 0, which is buildArmProximityEnvelope's own
// zero-arms behaviour (a constant-zero envelope, not "reweight disabled"):
// at armBias>0 this still applies base*(1-armBias), same as the CPU.
// 'round' ties-to-even vs. JS's Math.round ties-away-from-zero only
// disagrees exactly on an angle-wrap half-integer boundary — unreachable
// for real (non-adversarial) angles.
fn evalWeight(texel: vec4<f32>, ring: u32, radius: f32, angle: f32) -> f32 {
  let base = dot(params.channelWeights, texel);
  if (params.armBias <= 0.0) {
    return base;
  }
  let armCount = u32(params.armCount);
  var acc = 0.0;
  for (var a = 0u; a < armCount; a++) {
    let e = armEnvelopeBuf[ring * armCount + a];
    if (e.weight <= 0.0 || e.invSigma <= 0.0) {
      continue;
    }
    let raw = angle - e.ridgeAngle;
    let wrapped = raw - ISM_MAP_CDF_TWO_PI * round(raw / ISM_MAP_CDF_TWO_PI);
    let z = radius * wrapped * e.invSigma;
    acc += e.weight * exp(-0.5 * z * z);
  }
  let envelope = min(1.0, acc);
  return base * (1.0 + params.armBias * (envelope - 1.0));
}

var<workgroup> scanBuf: array<f32, ISM_MAP_CDF_SCAN_WORKGROUP_SIZE>;
var<workgroup> ringCarry: f32;

// csRingScan — one workgroup per ring: an inclusive Hillis-Steele scan over
// az in WORKGROUP_SIZE-wide tiles, carried tile-to-tile in ringCarry, so
// prefixBuf ends holding each ring's own LOCAL (ring-relative) running mass
// — csApplyRingOffsets adds the cross-ring offset back in a later pass.
// Dispatch numWorkgroups = (1, rings, 1).
@compute @workgroup_size(ISM_MAP_CDF_SCAN_WORKGROUP_SIZE)
fn csRingScan(
  @builtin(workgroup_id) wgid: vec3<u32>,
  @builtin(local_invocation_index) localIndex: u32,
) {
  let rings = u32(params.rings);
  let az = u32(params.az);
  let ring = wgid.y;
  if (ring >= rings) {
    return;
  }
  let dTheta = ISM_MAP_CDF_TWO_PI / f32(az);
  let edges = ismMapDustRingEdges(ring, rings, params.rMin, params.rMax);
  let texelArea = 0.5 * dTheta * (edges.y * edges.y - edges.x * edges.x);
  let radius = ismMapRingRadius(ring, rings, params.rMin, params.rMax);

  if (localIndex == 0u) {
    ringCarry = 0.0;
  }
  workgroupBarrier();

  // Uniform control flow: az/rings are uniform-buffer values and tileStart
  // advances by the same compile-time constant for every invocation, so
  // this loop (and the barriers inside it) run the same number of times
  // regardless of localIndex — same discipline ringReduce.wesl's own
  // stride-halving loop documents.
  var tileStart = 0u;
  loop {
    if (tileStart >= az) {
      break;
    }
    let col = tileStart + localIndex;
    var value = 0.0;
    if (col < az) {
      let angle = (f32(col) + 0.5) * dTheta;
      let texel = textureLoad(ismMapTex, vec2<i32>(i32(col), i32(ring)), 0);
      value = evalWeight(texel, ring, radius, angle) * texelArea;
    }
    scanBuf[localIndex] = value;
    workgroupBarrier();

    // Two-barrier in-place Hillis-Steele: every invocation reads its
    // neighbour BEFORE any invocation writes, so a fast thread can't
    // clobber a slower thread's still-needed input.
    var offset = 1u;
    loop {
      if (offset >= ISM_MAP_CDF_SCAN_WORKGROUP_SIZE) {
        break;
      }
      var added = 0.0;
      if (localIndex >= offset) {
        added = scanBuf[localIndex - offset];
      }
      workgroupBarrier();
      if (localIndex >= offset) {
        scanBuf[localIndex] += added;
      }
      workgroupBarrier();
      offset = offset * 2u;
    }

    if (col < az) {
      prefixBuf[ring * az + col] = ringCarry + scanBuf[localIndex];
    }
    workgroupBarrier();
    if (localIndex == ISM_MAP_CDF_SCAN_WORKGROUP_SIZE - 1u) {
      ringCarry += scanBuf[ISM_MAP_CDF_SCAN_WORKGROUP_SIZE - 1u];
    }
    workgroupBarrier();
    tileStart += ISM_MAP_CDF_SCAN_WORKGROUP_SIZE;
  }

  if (localIndex == 0u) {
    ringTotalsBuf[ring] = ringCarry;
  }
}

// csFoldRingOffsets — single-invocation sequential exclusive scan over
// ringTotalsBuf (rings is at most a few hundred, trivial here), turning
// each ring's own total into the running offset csApplyRingOffsets adds.
// Sequential on purpose: this is the SAME ring-to-ring order
// buildIsmMapDustCdf.ts's outer loop carries its running sum through, so
// this pass costs nothing extra to match the CPU exactly at ring granularity.
// Dispatch numWorkgroups = (1, 1, 1).
@compute @workgroup_size(1)
fn csFoldRingOffsets(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x != 0u) {
    return;
  }
  var running = 0.0;
  let rings = u32(params.rings);
  for (var ring = 0u; ring < rings; ring++) {
    let total = ringTotalsBuf[ring];
    ringTotalsBuf[ring] = running;
    running += total;
  }
}

// csApplyRingOffsets — grid-wide: prefixBuf[ring, az] += ringTotalsBuf[ring]
// (now an offset, post-fold), turning every ring's local scan into the
// map-wide running mass buildIsmMapDustCdf.ts's 'prefix' array holds.
// Dispatch numWorkgroups = (ceil(az/16), ceil(rings/16), 1).
@compute @workgroup_size(16, 16)
fn csApplyRingOffsets(@builtin(global_invocation_id) gid: vec3<u32>) {
  let az = u32(params.az);
  let rings = u32(params.rings);
  if (gid.x >= az || gid.y >= rings) {
    return;
  }
  prefixBuf[gid.y * az + gid.x] += ringTotalsBuf[gid.y];
}
