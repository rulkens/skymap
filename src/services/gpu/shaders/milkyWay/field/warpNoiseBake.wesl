// milkyWay/field/warpNoiseBake.wesl — one-shot compute bake of a 64^3
// VALUE-noise volume, for starGrain.wesl's domain-warp displacement ONLY —
// a separate volume from dustNoiseBake.wesl's ridged fbm, since dust/DIG/
// shell erosion wants a smoother, spatially correlated field while the warp
// wants value noise's blockier, higher-headroom character. Builds three xyz
// channels (integerHash3 + tileableValueNoise3D + ridged fold) at
// 1x/2x/4x frequency — the bands starGrain.wesl reads for its warp, kept
// independent of dustNoiseTex.xyz. TILEABLE: every lattice index wraps its
// band's cells.

import package::lib::util::integerHash3;

@group(0) @binding(0) var dst: texture_storage_3d<rgba8unorm, write>;

const BASE_CELLS: u32 = 8u;

// tileableValueNoise3D — trilinear value noise; wraps lattice indices at
// 'cells' for seamless tiling.
fn tileableValueNoise3D(uv: vec3<f32>, cells: u32) -> f32 {
  let cellsI = i32(cells);
  let i0f = floor(uv);
  let fraction = uv - i0f;
  let fade = fraction * fraction * (3.0 - 2.0 * fraction);
  let cornerLow = vec3<i32>(i0f) % vec3<i32>(cellsI);
  let cornerHigh = (cornerLow + vec3<i32>(1)) % vec3<i32>(cellsI);

  let c000 = integerHash3(vec3<i32>(cornerLow.x, cornerLow.y, cornerLow.z));
  let c100 = integerHash3(vec3<i32>(cornerHigh.x, cornerLow.y, cornerLow.z));
  let c010 = integerHash3(vec3<i32>(cornerLow.x, cornerHigh.y, cornerLow.z));
  let c110 = integerHash3(vec3<i32>(cornerHigh.x, cornerHigh.y, cornerLow.z));
  let c001 = integerHash3(vec3<i32>(cornerLow.x, cornerLow.y, cornerHigh.z));
  let c101 = integerHash3(vec3<i32>(cornerHigh.x, cornerLow.y, cornerHigh.z));
  let c011 = integerHash3(vec3<i32>(cornerLow.x, cornerHigh.y, cornerHigh.z));
  let c111 = integerHash3(vec3<i32>(cornerHigh.x, cornerHigh.y, cornerHigh.z));

  let x00 = mix(c000, c100, fade.x);
  let x10 = mix(c010, c110, fade.x);
  let x01 = mix(c001, c101, fade.x);
  let x11 = mix(c011, c111, fade.x);
  let faceZ0 = mix(x00, x10, fade.y);
  let faceZ1 = mix(x01, x11, fade.y);
  return mix(faceZ0, faceZ1, fade.z);
}

// WARP_MEAN_R — the ridged fold's empirical mean (JS-mirror audit,
// 2026-08-10), NOT 0.5: trilinear-averaged hashes concentrate n near 0.5,
// so 1-abs(2n-1) concentrates near its ceiling of 1, not its midpoint.
const WARP_MEAN_R: f32 = 0.70;

// centerFold — recentres a ridged band around WARP_MEAN_R (not the naive
// 0.5) so E[centered] == 0.5 by linearity of expectation for ANY slope; the
// slope 0.5/(1-WARP_MEAN_R) is chosen so the fold's ceiling (ridge=1) lands
// exactly on 1, using the full headroom on the side starGrain.wesl's warp
// draws from most. Consequence: ridge below 2*WARP_MEAN_R-1 (~0.4) undershoots
// 0 and clips there — a real, not defensive, clamp; the same skew that
// makes WARP_MEAN_R high also makes that low tail the minority.
fn centerFold(ridge: f32) -> f32 {
  return clamp(0.5 + (ridge - WARP_MEAN_R) * 0.5 / (1.0 - WARP_MEAN_R), 0.0, 1.0);
}

// warpBand — one xyz displacement channel: ridged fold of tileable value
// noise at 'freqMul' times BASE_CELLS, then recentred. Raw fold kept
// visible at the call site (not buried in centerFold) since its exact
// [0,1] range is what fixes centerFold's clip threshold above.
fn warpBand(uv: vec3<f32>, freqMul: u32) -> f32 {
  let cells = BASE_CELLS * freqMul;
  let valueNoise = tileableValueNoise3D(uv * f32(cells), cells);
  let ridge = 1.0 - abs(2.0 * valueNoise - 1.0);
  return centerFold(ridge);
}

@compute @workgroup_size(4, 4, 4)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(dst);
  if (any(gid >= dims)) {
    return;
  }
  let uv = vec3<f32>(gid) / vec3<f32>(dims);
  let warp = vec4<f32>(warpBand(uv, 1u), warpBand(uv, 2u), warpBand(uv, 4u), 0.0);
  textureStore(dst, vec3<i32>(gid), warp);
}
