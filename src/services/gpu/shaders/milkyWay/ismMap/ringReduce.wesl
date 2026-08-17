// milkyWay/ismMap/ringReduce.wesl — GPU workgroup reductions over the
// ISM-map placement chain: csRingMeans (GPU replacement for
// ismMapRingMeans.ts's CPU loop — see that file's own header for why a
// per-ring array, not one map-wide mean, is load-bearing), csSurvivorSum
// (dust's consume-time renorm scale, replacing the CPU's former sumR2
// loop), and csArmCloudFluxWeightSum/csArmSpurFluxWeightSum (their own
// renorm reciprocals — see FluxWeightSumParams below for why bare, not
// totalFlux/weightSum). Four independent kernels sharing one module and one
// @group(0) binding namespace, each with its own workgroup-local
// partial-sum array and tree-reduce barrier loop.

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
// the whole MAX_PARTICLE_COUNT buffer). totalMass is a pure function of
// geometry/tau with no placement dependency; computePlaceDustBudget.ts
// computes it CPU-side and packs it here alongside count.
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
    // 'coeff', the same "nothing to draw" outcome a sumless CPU pass would
    // leave behind.
    renormScaleOut[0] = select(0.0, survivorParams.totalMass / sumR2, sumR2 > 0.0);
  }
}

// FluxWeightSumParams — the arm-cloud/spur-cloud reductions' own params. No
// 'total' field (unlike SurvivorSumParams above): the output is a bare
// reciprocal, this file's own header doc explains why.
struct FluxWeightSumParams {
  count: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(5) var<uniform> armCloudFluxWeightSumParams: FluxWeightSumParams;
@group(0) @binding(6) var<storage, read> armCloudFluxWeightBuf: array<f32>;
@group(0) @binding(7) var<storage, read_write> armCloudRenormOut: array<f32>;

var<workgroup> armCloudFluxWeightPartial: array<f32, RING_REDUCE_WORKGROUP_SIZE>;

@compute @workgroup_size(RING_REDUCE_WORKGROUP_SIZE)
fn csArmCloudFluxWeightSum(@builtin(local_invocation_index) localIndex: u32) {
  var sum: f32 = 0.0;
  for (var i = localIndex; i < armCloudFluxWeightSumParams.count; i += RING_REDUCE_WORKGROUP_SIZE) {
    sum += armCloudFluxWeightBuf[i];
  }
  armCloudFluxWeightPartial[localIndex] = sum;
  workgroupBarrier();

  for (var stride = RING_REDUCE_WORKGROUP_SIZE / 2u; stride > 0u; stride /= 2u) {
    if (localIndex < stride) {
      armCloudFluxWeightPartial[localIndex] += armCloudFluxWeightPartial[localIndex + stride];
    }
    workgroupBarrier();
  }

  if (localIndex == 0u) {
    let weightSum = armCloudFluxWeightPartial[0];
    // weightSum <= 0 (no particles, or count == 0): 0 zeroes
    // fieldSplat/fragment.wesl's consuming multiply the same way
    // csSurvivorSum's own sumR2 <= 0 branch zeroes dustMap/fragment.wesl's.
    armCloudRenormOut[0] = select(0.0, 1.0 / weightSum, weightSum > 0.0);
  }
}

@group(0) @binding(8) var<uniform> armSpurFluxWeightSumParams: FluxWeightSumParams;
@group(0) @binding(9) var<storage, read> armSpurFluxWeightBuf: array<f32>;
@group(0) @binding(10) var<storage, read_write> armSpurRenormOut: array<f32>;

var<workgroup> armSpurFluxWeightPartial: array<f32, RING_REDUCE_WORKGROUP_SIZE>;

@compute @workgroup_size(RING_REDUCE_WORKGROUP_SIZE)
fn csArmSpurFluxWeightSum(@builtin(local_invocation_index) localIndex: u32) {
  var sum: f32 = 0.0;
  for (var i = localIndex; i < armSpurFluxWeightSumParams.count; i += RING_REDUCE_WORKGROUP_SIZE) {
    sum += armSpurFluxWeightBuf[i];
  }
  armSpurFluxWeightPartial[localIndex] = sum;
  workgroupBarrier();

  for (var stride = RING_REDUCE_WORKGROUP_SIZE / 2u; stride > 0u; stride /= 2u) {
    if (localIndex < stride) {
      armSpurFluxWeightPartial[localIndex] += armSpurFluxWeightPartial[localIndex + stride];
    }
    workgroupBarrier();
  }

  if (localIndex == 0u) {
    let weightSum = armSpurFluxWeightPartial[0];
    armSpurRenormOut[0] = select(0.0, 1.0 / weightSum, weightSum > 0.0);
  }
}
