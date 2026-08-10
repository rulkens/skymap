// milkyWay/ismMap/ismMapOrientationTensorBlur.wesl — stage 3: separable
// Gaussian blur (sigmaInteg — see ismMapOrientationLib.wesl's struct comment
// on why it differs from stage 1's sigmaDeriv) of the packed (Jxx,Jxy,Jyy)
// tensor, all three channels through ONE pass per axis, rather than a
// separate single-channel pass per channel per axis (six passes for the
// same work). Same wrap/clamp asymmetry as ismMapOrientationField.wesl.

import package::milkyWay::ismMap::ismMapOrientationLib::IsmMapOrientationSigma;
import package::milkyWay::ismMap::ismMapOrientationLib::wrapIndex;
import package::milkyWay::ismMap::ismMapOrientationLib::clampIndex;
import package::milkyWay::ismMap::ismMapOrientationLib::gaussianTap;
import package::milkyWay::ismMap::ismMapOrientationLib::kernelRadius;

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> sigma: IsmMapOrientationSigma;

@compute @workgroup_size(16, 16)
fn csBlurAzimuth(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(dst);
  if (any(gid.xy >= dims)) {
    return;
  }
  let radius = kernelRadius(sigma.sigmaInteg);
  var sum = vec3<f32>(0.0);
  var wsum = 0.0;
  for (var k = -radius; k <= radius; k++) {
    let a = wrapIndex(i32(gid.x) + k, dims.x);
    let w = gaussianTap(k, sigma.sigmaInteg);
    sum += textureLoad(srcTex, vec2<i32>(i32(a), i32(gid.y)), 0).xyz * w;
    wsum += w;
  }
  textureStore(dst, vec2<i32>(gid.xy), vec4<f32>(sum / wsum, 0.0));
}

@compute @workgroup_size(16, 16)
fn csBlurRing(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(dst);
  if (any(gid.xy >= dims)) {
    return;
  }
  let radius = kernelRadius(sigma.sigmaInteg);
  var sum = vec3<f32>(0.0);
  var wsum = 0.0;
  for (var k = -radius; k <= radius; k++) {
    let r = clampIndex(i32(gid.y) + k, dims.y);
    let w = gaussianTap(k, sigma.sigmaInteg);
    sum += textureLoad(srcTex, vec2<i32>(i32(gid.x), i32(r)), 0).xyz * w;
    wsum += w;
  }
  textureStore(dst, vec2<i32>(gid.xy), vec4<f32>(sum / wsum, 0.0));
}
