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
  let f = uv - i0f;
  let t = f * f * (3.0 - 2.0 * f);
  let i0 = vec3<i32>(i0f) % vec3<i32>(cellsI);
  let i1 = (i0 + vec3<i32>(1)) % vec3<i32>(cellsI);

  let c000 = integerHash3(vec3<i32>(i0.x, i0.y, i0.z));
  let c100 = integerHash3(vec3<i32>(i1.x, i0.y, i0.z));
  let c010 = integerHash3(vec3<i32>(i0.x, i1.y, i0.z));
  let c110 = integerHash3(vec3<i32>(i1.x, i1.y, i0.z));
  let c001 = integerHash3(vec3<i32>(i0.x, i0.y, i1.z));
  let c101 = integerHash3(vec3<i32>(i1.x, i0.y, i1.z));
  let c011 = integerHash3(vec3<i32>(i0.x, i1.y, i1.z));
  let c111 = integerHash3(vec3<i32>(i1.x, i1.y, i1.z));

  let x00 = mix(c000, c100, t.x);
  let x10 = mix(c010, c110, t.x);
  let x01 = mix(c001, c101, t.x);
  let x11 = mix(c011, c111, t.x);
  let y0 = mix(x00, x10, t.y);
  let y1 = mix(x01, x11, t.y);
  return mix(y0, y1, t.z);
}

// WARP_MEAN_R — the ridged fold's empirical mean (JS-mirror audit,
// 2026-08-10), NOT 0.5: trilinear-averaged hashes concentrate n near 0.5,
// so 1-abs(2n-1) concentrates near its ceiling of 1, not its midpoint.
const WARP_MEAN_R: f32 = 0.70;

// centerFold — recentres a ridged band around WARP_MEAN_R (not the naive
// 0.5) so E[centered] == 0.5 by linearity of expectation for ANY slope; the
// slope 0.5/(1-WARP_MEAN_R) is chosen so the fold's ceiling (r=1) lands
// exactly on 1, using the full headroom on the side starGrain.wesl's warp
// draws from most. Consequence: r below 2*WARP_MEAN_R-1 (~0.4) undershoots
// 0 and clips there — a real, not defensive, clamp; the same skew that
// makes WARP_MEAN_R high also makes that low tail the minority.
fn centerFold(r: f32) -> f32 {
  return clamp(0.5 + (r - WARP_MEAN_R) * 0.5 / (1.0 - WARP_MEAN_R), 0.0, 1.0);
}

// warpBand — one xyz displacement channel: ridged fold of tileable value
// noise at 'freqMul' times BASE_CELLS, then recentred. Raw fold kept
// visible at the call site (not buried in centerFold) since its exact
// [0,1] range is what fixes centerFold's clip threshold above.
fn warpBand(uv: vec3<f32>, freqMul: u32) -> f32 {
  let cells = BASE_CELLS * freqMul;
  let n = tileableValueNoise3D(uv * f32(cells), cells);
  let r = 1.0 - abs(2.0 * n - 1.0);
  return centerFold(r);
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
