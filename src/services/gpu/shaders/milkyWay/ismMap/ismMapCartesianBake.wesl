// milkyWay/ismMap/ismMapCartesianBake.wesl — one-shot cartesian re-bake of
// the packed log-polar ISM map, so stage 2's per-fragment consumers can drop
// dustDetail.wesl's length+atan2+log+two-fetch cost to one affine UV fetch.
// R = the pre-divided detail ratio (DETAIL_MAX clamp and strength/breakup
// mixing stay in the consumer); G = stars, straight copy. Dispatched once
// per rebuild, right after the dust-blur pass it reads; consumed through
// dustDetail.wesl's ismCartesianUv.

import package::milkyWay::ismMap::ismMapGrid::IsmMapGrid;

const PI: f32 = 3.14159265358979;
// Absolute density floor for the ratio below — sole owner since stage 2
// (dustDetail.wesl consumes the baked ratio, no copy of its own).
const DETAIL_EPS: f32 = 0.02;
// Mirrors ISM_MAP_AMBIENT_DUST (ismMapAmbientDust.ts) — parity-tested.
const ISM_MAP_AMBIENT_DUST: f32 = 1.0;

// rMin/rMax — same grid dustDetail.wesl's ismMapUv resolves through.
@group(0) @binding(0) var srcTex: texture_2d<f32>; // packed ismMap: x=gas, y=stars, z=activity, w=dust
@group(0) @binding(1) var blurTex: texture_2d<f32>; // S4's low-pass divisor (ismMapDustBlur.wesl)
// Reused from IsmMapOutput's mapSampler (repeat-U matches azT, clamp-V
// matches ringT below) — the exact wrap this bake needs, no second sampler.
@group(0) @binding(2) var smp: sampler;
@group(0) @binding(3) var<uniform> grid: IsmMapGrid;
// rgba16float, not rg16float: the only storage format that's also
// filterable (ismMapDustBlur.wesl's precedent) — stage 2 wants bilinear.
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(16, 16)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(dst);
  if (any(gid.xy >= dims)) {
    return;
  }
  // Square texture: one cellSize serves both axes; texel CENTER, not corner.
  let halfExtent = grid.rMax;
  let cellSize = (2.0 * halfExtent) / f32(dims.x);
  let world = (vec2<f32>(gid.xy) + vec2<f32>(0.5, 0.5)) * cellSize - vec2<f32>(halfExtent, halfExtent);
  let r = length(world);

  if (r > grid.rMax) {
    textureStore(dst, vec2<i32>(gid.xy), vec4<f32>(1.0, 0.0, 0.0, 0.0)); // square corners only — neutral
    return;
  }

  // Forward log-polar transform into the packed map — the ONLY home of this
  // transform since stage 2 deleted dustDetail.wesl's per-fragment ismMapUv;
  // must match the (az, ring) layout the ismMap passes write and
  // ismMapPresent.wesl's fs resolves through the same grid.
  let rSample = max(r, grid.rMin); // radial clamp: continuous extension inside rMin
  let theta = atan2(world.y, world.x);
  let ringT = log(rSample / grid.rMin) / log(grid.rMax / grid.rMin);
  let azT = theta / (2.0 * PI) + select(0.0, 1.0, theta < 0.0);
  let uv = vec2<f32>(azT, ringT);

  let mapTexel = textureSampleLevel(srcTex, smp, uv, 0.0);
  let density = max(mapTexel.w - ISM_MAP_AMBIENT_DUST, 0.0);
  let densityBlur = textureSampleLevel(blurTex, smp, uv, 0.0).x;
  let ratio = (density + DETAIL_EPS) / (densityBlur + DETAIL_EPS);

  textureStore(dst, vec2<i32>(gid.xy), vec4<f32>(ratio, mapTexel.y, 0.0, 0.0));
}
