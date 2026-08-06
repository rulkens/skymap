// milkyWay/ismMap/ismMapOrientationField.wesl — stage 1 of the GPU
// structure-tensor orientation pass chain: separable Gaussian blur
// (sigmaDeriv) of ismMapPack.wesl's dust (A) channel — not activity,
// which is an Eulerian EMA of isotropic event stamps and yields ring-
// shaped tensors, not lane-shaped ones. Two dispatches (csBlurAzimuth then
// csBlurRing), ping-ponging through one scratch texture — a single
// invocation cannot blur along both axes without reading a texel another
// invocation in the same pass is still writing. csBlurAzimuth alone
// subtracts the known dust pedestal (below) first, so a constant offset
// really does reach the tensor with zero gradient.

import package::milkyWay::ismMap::ismMapOrientationLib::IsmMapOrientationSigma;
import package::milkyWay::ismMap::ismMapOrientationLib::wrapIndex;
import package::milkyWay::ismMap::ismMapOrientationLib::clampIndex;
import package::milkyWay::ismMap::ismMapOrientationLib::gaussianTap;
import package::milkyWay::ismMap::ismMapOrientationLib::kernelRadius;
import package::milkyWay::ismMap::ismMapShear::ismMapRingRadius;

// The fluid generator seeds step-0 dust to ambient*gasProfile(r)
// (ismMapFluidStep.wesl) — a smooth RADIAL gradient the structure tensor
// below would otherwise read as a confident TANGENTIAL ridge (jyy >> jxx),
// biasing orientation circumferentially wherever real structure is faint.
// gasFloor=1 makes gasProfile(r) === 1 everywhere, i.e. the automaton's own
// flat ISM_MAP_AMBIENT_DUST pedestal — one formula, two generators; the CPU
// packer feeds gasFloor=1 for the automaton and the live fluid-tuning
// values otherwise.
struct IsmMapOrientationPedestal {
  gasFloor: f32,
  gasScaleLength: f32,
  rMin: f32,
  rMax: f32,
  ambient: f32,
}

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<r32float, write>;
@group(0) @binding(2) var<uniform> sigma: IsmMapOrientationSigma;
@group(0) @binding(3) var<uniform> pedestal: IsmMapOrientationPedestal;

fn dustPedestal(ring: u32, ringCount: u32) -> f32 {
  let r = ismMapRingRadius(ring, ringCount, pedestal.rMin, pedestal.rMax);
  let profile = pedestal.gasFloor + (1.0 - pedestal.gasFloor) * exp(-r / pedestal.gasScaleLength);
  return pedestal.ambient * profile;
}

// Reads ismMapPack.wesl's packed rgba16float output directly, extracting the
// dust (.w) channel — no separate CPU-side extraction step needed.
@compute @workgroup_size(16, 16)
fn csBlurAzimuth(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(dst);
  if (any(gid.xy >= dims)) {
    return;
  }
  let radius = kernelRadius(sigma.sigmaDeriv);
  let pedestalHere = dustPedestal(gid.y, dims.y);
  var sum = 0.0;
  var wsum = 0.0;
  for (var k = -radius; k <= radius; k++) {
    let a = wrapIndex(i32(gid.x) + k, dims.x);
    let w = gaussianTap(k, sigma.sigmaDeriv);
    let dust = textureLoad(srcTex, vec2<i32>(i32(a), i32(gid.y)), 0).w;
    sum += max(dust - pedestalHere, 0.0) * w;
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
