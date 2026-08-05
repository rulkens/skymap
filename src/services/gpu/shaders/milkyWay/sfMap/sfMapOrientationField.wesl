// milkyWay/sfMap/sfMapOrientationField.wesl — stage 1 of the GPU
// structure-tensor orientation pass chain: separable Gaussian blur
// (sigmaDeriv) of sfMapPack.wesl's dust (A) channel — not activity,
// which is an Eulerian EMA of isotropic event stamps and yields ring-
// shaped tensors, not lane-shaped ones. Replaces the deleted
// buildSfMapOrientation.ts's blurLogPolar. Two dispatches (csBlurAzimuth
// then csBlurRing), ping-ponging through one scratch texture — a single
// invocation cannot blur along both axes at once without reading a texel
// another invocation in the same pass is still writing.

import package::milkyWay::sfMap::sfMapOrientationLib::SfMapOrientationSigma;
import package::milkyWay::sfMap::sfMapOrientationLib::wrapIndex;
import package::milkyWay::sfMap::sfMapOrientationLib::clampIndex;
import package::milkyWay::sfMap::sfMapOrientationLib::gaussianTap;
import package::milkyWay::sfMap::sfMapOrientationLib::kernelRadius;

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<r32float, write>;
@group(0) @binding(2) var<uniform> sigma: SfMapOrientationSigma;

// Reads sfMapPack.wesl's packed rgba16float output directly, extracting the
// dust (.w) channel — no separate CPU-side extraction step needed. The
// SF_MAP_AMBIENT_DUST pedestal baked into that channel needs no subtraction
// here: the structure tensor consumes gradients only, and a constant offset
// has zero gradient.
@compute @workgroup_size(16, 16)
fn csBlurAzimuth(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(dst);
  if (any(gid.xy >= dims)) {
    return;
  }
  let radius = kernelRadius(sigma.sigmaDeriv);
  var sum = 0.0;
  var wsum = 0.0;
  for (var k = -radius; k <= radius; k++) {
    let a = wrapIndex(i32(gid.x) + k, dims.x);
    let w = gaussianTap(k, sigma.sigmaDeriv);
    sum += textureLoad(srcTex, vec2<i32>(i32(a), i32(gid.y)), 0).w * w;
    wsum += w;
  }
  textureStore(dst, vec2<i32>(gid.xy), vec4<f32>(sum / wsum, 0.0, 0.0, 0.0));
}

// Reads stage 1a's r32float output — a bare .x load, no channel
// extraction needed a second time.
@compute @workgroup_size(16, 16)
fn csBlurRing(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(dst);
  if (any(gid.xy >= dims)) {
    return;
  }
  let radius = kernelRadius(sigma.sigmaDeriv);
  var sum = 0.0;
  var wsum = 0.0;
  for (var k = -radius; k <= radius; k++) {
    let r = clampIndex(i32(gid.y) + k, dims.y);
    let w = gaussianTap(k, sigma.sigmaDeriv);
    sum += textureLoad(srcTex, vec2<i32>(i32(gid.x), i32(r)), 0).x * w;
    wsum += w;
  }
  textureStore(dst, vec2<i32>(gid.xy), vec4<f32>(sum / wsum, 0.0, 0.0, 0.0));
}
