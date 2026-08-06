// milkyWay/ismMap/ismMapOrientationTensor.wesl — stage 2: central-difference
// gradient of the smoothed field -> structure tensor (Jxx,Jxy,Jyy), packed
// into one rgba16float texture's RGB so stage 3 blurs all three channels in
// one separable pass instead of six.
//
// Regression signatures from the deleted buildIsmMapOrientation.test.ts: a
// 40-texel ridge recovers pitch <=0.18deg flat across radii; dropping the
// aspect weight below biases it a flat 5.33deg; a purely azimuthal ridge
// must recover ~0deg, never ~90deg (sign finished in
// ismMapOrientationCoherence.wesl).

import package::milkyWay::ismMap::ismMapOrientationLib::wrapIndex;
import package::milkyWay::ismMap::ismMapOrientationLib::clampIndex;
import package::milkyWay::ismMap::ismMapShear::ismMapRingRadius;

const PI: f32 = 3.14159265358979;

struct IsmMapOrientationGrid {
  rMin: f32,
  rMax: f32,
}

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> grid: IsmMapOrientationGrid;

@compute @workgroup_size(16, 16)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(dst);
  if (any(gid.xy >= dims)) {
    return;
  }

  // Log-polar is conformal: an az texel spans r*2*PI/az physically, a ring
  // texel spans r*ln(rMax/rMin)/(rings-1) — the ratio is r-INDEPENDENT, so
  // ONE constant equalises the two derivative axes at every radius. Via
  // ismMapRingRadius (ratio of consecutive rings), the same shared module
  // ismMapAutomatonStep.wesl/ismMapPack.wesl use for shear, never a restated formula.
  let azTexelSize = 2.0 * PI / f32(dims.x);
  let ringTexelSize = log(
    ismMapRingRadius(1u, dims.y, grid.rMin, grid.rMax)
      / ismMapRingRadius(0u, dims.y, grid.rMin, grid.rMax),
  );
  let aspect = ringTexelSize / azTexelSize;

  let aPrev = wrapIndex(i32(gid.x) - 1, dims.x);
  let aNext = wrapIndex(i32(gid.x) + 1, dims.x);
  let rPrev = clampIndex(i32(gid.y) - 1, dims.y);
  let rNext = clampIndex(i32(gid.y) + 1, dims.y);
  // Guards the degenerate 1-ring-grid divide-by-zero, matching the deleted
  // CPU builder's own rSpan fallback.
  let rSpan = f32(max(1, i32(rNext) - i32(rPrev)));

  let gx = (textureLoad(srcTex, vec2<i32>(i32(aNext), i32(gid.y)), 0).x
    - textureLoad(srcTex, vec2<i32>(i32(aPrev), i32(gid.y)), 0).x) / 2.0;
  let gyRaw = (textureLoad(srcTex, vec2<i32>(i32(gid.x), i32(rNext)), 0).x
    - textureLoad(srcTex, vec2<i32>(i32(gid.x), i32(rPrev)), 0).x) / rSpan;
  let gy = gyRaw / aspect;

  // Blurring gx*gx (etc.), not gx/gy themselves, is what makes crest
  // orientation well-defined at a ridge peak where the raw gradient is ~0.
  let jxx = gx * gx;
  let jxy = gx * gy;
  let jyy = gy * gy;
  textureStore(dst, vec2<i32>(gid.xy), vec4<f32>(jxx, jxy, jyy, 0.0));
}
