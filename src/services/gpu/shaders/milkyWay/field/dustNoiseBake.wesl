// milkyWay/field/dustNoiseBake.wesl — one-shot compute bake of the 128^3
// ridged-fbm volume dustMap.wesl multiplies the particle cloud's tau by (see
// its header). One ridged BAND per channel at 1x/2x/4x/8x the base tile
// frequency, so a single textureSampleLevel call in the reader is already a
// 4-octave result — the whole point of baking instead of evaluating fbm
// per-fragment.
//
// RIDGED, not plain value noise: r = 1 - abs(2n - 1) folds a [0,1] value
// field into a sharp V at n=0.5, so it reads as thin bright filaments over a
// dark field instead of plain fbm's isotropic soft lumps — the erosion this
// exists for is filamentary erosion, not a lumpier ellipsoid.
//
// TILEABLE by construction: every lattice lookup wraps its integer index
// modulo the band's own cell count, so the volume repeats seamlessly when
// dustMap.wesl samples it with a 'repeat' sampler at world-position /
// tileUnits. A non-tiling bake would show a hard seam at every tile
// boundary — the one defect here that looks broken and isn't a quick fix.
//
// The hash lives in this file rather than growing lib/util.wesl's
// hash21/valueNoise2 (2D, non-tileable, tuned for screen-space dither) into
// a second variant for this one 3D tileable consumer.

@group(0) @binding(0) var dst: texture_storage_3d<rgba8unorm, write>;

/** Lattice cells per axis for BAND_FREQ 1.0 (band 0); later bands scale this
 * up by their own frequency, so the bake stays one function of (uv, cells). */
const BASE_CELLS: u32 = 8u;

// integerHash3 — Bob Jenkins/Squirrel-family 3-int avalanche: three large
// odd multiplies then two xor-shifts. Cheap, no transcendentals, and (unlike
// hash21's dot-then-sin) has no diagonal banding at the low lattice
// resolutions this bake samples at (8..64 cells/axis).
fn integerHash3(p: vec3<i32>) -> f32 {
  let x = bitcast<u32>(p.x);
  let y = bitcast<u32>(p.y);
  let z = bitcast<u32>(p.z);
  var h = x * 374761393u + y * 668265263u + z * 2246822519u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return f32(h ^ (h >> 16u)) / 4294967295.0;
}

// tileableValueNoise3D — trilinear value noise over an integer lattice of
// 'cells' per axis, wrapping (not clamping) at the lattice edge: that wrap
// is what makes the bake's own [0,1) UV space tile seamlessly.
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

// ridgedBand — one octave: sample tileable value noise at 'freqMul' times
// BASE_CELLS, then fold it into a ridge. n is in [0,1] by construction
// (mix of hashes that are each in [0,1)), so r = 1-abs(2n-1) lands in [0,1]
// with no clamp needed.
fn ridgedBand(uv: vec3<f32>, freqMul: u32) -> f32 {
  let cells = BASE_CELLS * freqMul;
  let n = tileableValueNoise3D(uv * f32(cells), cells);
  return 1.0 - abs(2.0 * n - 1.0);
}

@compute @workgroup_size(4, 4, 4)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(dst);
  if (any(gid >= dims)) {
    return;
  }
  let uv = vec3<f32>(gid) / vec3<f32>(dims);
  let bands = vec4<f32>(
    ridgedBand(uv, 1u),
    ridgedBand(uv, 2u),
    ridgedBand(uv, 4u),
    ridgedBand(uv, 8u),
  );
  textureStore(dst, vec3<i32>(gid), bands);
}
