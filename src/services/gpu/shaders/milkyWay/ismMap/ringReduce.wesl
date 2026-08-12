// milkyWay/ismMap/ringReduce.wesl — GPU reductions over the ISM-map
// placement chain. csRingMeans is the original: GPU replacement for
// ismMapRingMeans.ts's CPU loop, one workgroup per envelope ring,
// workgroup-reducing ismMapTex's dust channel (w) across every azimuth
// column, writing the row mean straight into ringMeansBuf — the same
// per-ring divisor dustParticleCloud.ts's placement CDF and
// ismMapPresent.wesl's seeding view both read (see ismMapRingMeans.ts's own
// header for why a per-ring array, not one map-wide mean, is load-bearing).
// Dispatched with numWorkgroups = (ISM_MAP_RINGS, 1, 1); the grid-stride
// accumulation loop below tolerates any ISM_MAP_AZ, not just multiples of
// RING_REDUCE_WORKGROUP_SIZE.
//
// csSurvivorSum (Task 9) is a SECOND, independent reduction sharing this
// file rather than a bespoke module (the plan's own "one shared pass
// family" ruling — see the design spec's "Renorm: consume-time scale"
// section): dustParticleCloud.ts's 'sumR2 = sum(p.radius**2)' over
// post-survival-filter particles (:290-291), reduced here over
// placeDust.wesl's massOut buffer (already zeroed on a survival-floor
// miss — amplitude-as-liveness, mirrored onto massOut) instead of the ISM
// map. One workgroup handles the whole particle-slot domain (numWorkgroups
// = (1,1,1)) since there is exactly one scalar output, not one per ring;
// the grid-stride loop tolerates any count up to MAX_PARTICLE_COUNT. The
// output IS the consume-time renorm scale itself (massPerR2 =
// totalMass/sumR2, dustParticleCloud.ts:293) — folding the divide into this
// kernel avoids a second dispatch just to do one division.

const RING_REDUCE_WORKGROUP_SIZE: u32 = 256u;

@group(0) @binding(0) var ismMapTex: texture_2d<f32>; // x=gas,y=recentSf,z=activity,w=dust
@group(0) @binding(1) var<storage, read_write> ringMeansBuf: array<f32>;

var<workgroup> partialSums: array<f32, RING_REDUCE_WORKGROUP_SIZE>;

@compute @workgroup_size(RING_REDUCE_WORKGROUP_SIZE)
fn csRingMeans(
  @builtin(workgroup_id) wgid: vec3<u32>,
  @builtin(local_invocation_index) localIndex: u32,
) {
  let ring = wgid.x;
  let az = textureDimensions(ismMapTex).x;

  var sum: f32 = 0.0;
  for (var col = localIndex; col < az; col += RING_REDUCE_WORKGROUP_SIZE) {
    sum += textureLoad(ismMapTex, vec2<i32>(i32(col), i32(ring)), 0).w;
  }
  partialSums[localIndex] = sum;
  workgroupBarrier();

  // Uniform control flow — every invocation runs the same stride sequence
  // regardless of localIndex, so the barrier inside this loop is legal.
  for (var stride = RING_REDUCE_WORKGROUP_SIZE / 2u; stride > 0u; stride /= 2u) {
    if (localIndex < stride) {
      partialSums[localIndex] += partialSums[localIndex + stride];
    }
    workgroupBarrier();
  }

  if (localIndex == 0u) {
    ringMeansBuf[ring] = partialSums[0] / f32(az);
  }
}

// SurvivorSumParams — count is placeDust.wesl's own params.count for THIS
// rebuild (massOut beyond it holds a PREVIOUS, possibly larger, dispatch's
// stale values — the grid-stride loop below must stop at count, not scan
// the whole MAX_PARTICLE_COUNT buffer). totalMass is
// dustParticleCloud.ts:287's own totalMass, a pure function of geometry/tau
// with no placement dependency — computePlaceDustBudget.ts computes it
// CPU-side and packs it here alongside count.
struct SurvivorSumParams {
  count: u32,
  totalMass: f32,
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(2) var<uniform> survivorParams: SurvivorSumParams;
@group(0) @binding(3) var<storage, read> massBuf: array<f32>;
@group(0) @binding(4) var<storage, read_write> renormScaleOut: array<f32>;

var<workgroup> survivorPartial: array<f32, RING_REDUCE_WORKGROUP_SIZE>;

@compute @workgroup_size(RING_REDUCE_WORKGROUP_SIZE)
fn csSurvivorSum(@builtin(local_invocation_index) localIndex: u32) {
  var sum: f32 = 0.0;
  for (var i = localIndex; i < survivorParams.count; i += RING_REDUCE_WORKGROUP_SIZE) {
    sum += massBuf[i];
  }
  survivorPartial[localIndex] = sum;
  workgroupBarrier();

  for (var stride = RING_REDUCE_WORKGROUP_SIZE / 2u; stride > 0u; stride /= 2u) {
    if (localIndex < stride) {
      survivorPartial[localIndex] += survivorPartial[localIndex + stride];
    }
    workgroupBarrier();
  }

  if (localIndex == 0u) {
    let sumR2 = survivorPartial[0];
    // sumR2 <= 0 (no survivors, or count == 0): 0 is the correct scale, not
    // a divide-by-zero guard shrugged off — it zeroes dustMap/fragment.wesl's
    // 'coeff' the same way dustParticleCloud.ts's own '!(sumR2 > 0)' early
    // return leaves nothing to draw.
    renormScaleOut[0] = select(0.0, survivorParams.totalMass / sumR2, sumR2 > 0.0);
  }
}
