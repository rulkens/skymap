// milkyWay/ismMap/ringReduce.wesl — GPU replacement for ismMapRingMeans.ts's
// CPU loop: one workgroup per envelope ring, workgroup-reducing ismMapTex's
// dust channel (w) across every azimuth column, writing the row mean
// straight into ringMeansBuf — the same per-ring divisor
// dustParticleCloud.ts's placement CDF and ismMapPresent.wesl's seeding view
// both read (see ismMapRingMeans.ts's own header for why a per-ring array,
// not one map-wide mean, is load-bearing). Dispatched with numWorkgroups =
// (ISM_MAP_RINGS, 1, 1); the grid-stride accumulation loop below tolerates
// any ISM_MAP_AZ, not just multiples of RING_REDUCE_WORKGROUP_SIZE.

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
