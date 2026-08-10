// milkyWay/field/dustNoiseBake.wesl — one-shot compute bake of the 128^3
// GRADIENT-noise volume dustMap.wesl multiplies the particle cloud's tau by.
// Each of 4 channels is its own RIDGED band (r = 1-abs(2n-1), folding a
// [0,1] field into a filament-like V) at 1x/2x/4x/8x the base tile
// frequency, each band itself base + 0.5x double-frequency octave (fbm2)
// BEFORE the fold — ridged(fbm2(n)), one V per band, not two summed ridges.
// Quintic fade, not smoothstep: gradient noise needs C2 continuity or the
// fold's own kink at n=0.5 lines up with the interpolant's kink and shows
// as a lattice-aligned crease. TILEABLE: every lattice corner wraps its
// integer index modulo the band's own cell count.

import package::lib::util::integerHash3;

@group(0) @binding(0) var dst: texture_storage_3d<rgba8unorm, write>;

/** Lattice cells per axis for BAND_FREQ 1.0 (band 0); later bands scale this
 * up by their own frequency, so the bake stays one function of (uv, cells). */
const BASE_CELLS: u32 = 8u;

// GRAD_BOUND — the [0,1] remap denominator below. Not a tight analytic
// bound (the naive per-corner dot is <=3 worst-case); empirically checked
// to sqrt(3)/2 with ~9% headroom over 2M random samples per band's cell
// count — the same figure classic unit-gradient Perlin noise cites.
const GRAD_BOUND: f32 = 0.8660254;

// quinticFade — C2-continuous ease (t^3(6t^2-15t+10)); see the module
// header for why gradient noise needs this over a cubic smoothstep.
fn quinticFade(t: vec3<f32>) -> vec3<f32> {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

// latticeGradient — one lattice corner's gradient vector: integerHash3
// called 3x with a decorrelated per-axis offset (not reused three ways,
// which would give a gradient always parallel to (1,1,1)), each result
// remapped [0,1) -> [-1,1]. Left unnormalized — GRAD_BOUND already accounts
// for the unnormalized magnitude, so skipping the inverse-sqrt is free.
fn latticeGradient(idx: vec3<i32>) -> vec3<f32> {
  let gx = 2.0 * integerHash3(idx + vec3<i32>(1013, 0, 0)) - 1.0;
  let gy = 2.0 * integerHash3(idx + vec3<i32>(0, 1741, 0)) - 1.0;
  let gz = 2.0 * integerHash3(idx + vec3<i32>(0, 0, 2749)) - 1.0;
  return vec3<f32>(gx, gy, gz);
}

// gradientNoise3D — tileable Perlin-style gradient noise: each corner's
// gradient dotted with the corner-to-sample offset, quintic-faded trilinear
// blend. Wraps (not clamps) the GRADIENT lattice indices at 'cells' for
// seamless tiling. Raw output, NOT yet remapped to [0,1]; see ridgedBand
// below.
fn gradientNoise3D(uv: vec3<f32>, cells: u32) -> f32 {
  let cellsI = i32(cells);
  let i0f = floor(uv);
  let f = uv - i0f;
  let t = quinticFade(f);
  let i0 = vec3<i32>(i0f) % vec3<i32>(cellsI);
  let i1 = (i0 + vec3<i32>(1)) % vec3<i32>(cellsI);

  let g000 = latticeGradient(vec3<i32>(i0.x, i0.y, i0.z));
  let g100 = latticeGradient(vec3<i32>(i1.x, i0.y, i0.z));
  let g010 = latticeGradient(vec3<i32>(i0.x, i1.y, i0.z));
  let g110 = latticeGradient(vec3<i32>(i1.x, i1.y, i0.z));
  let g001 = latticeGradient(vec3<i32>(i0.x, i0.y, i1.z));
  let g101 = latticeGradient(vec3<i32>(i1.x, i0.y, i1.z));
  let g011 = latticeGradient(vec3<i32>(i0.x, i1.y, i1.z));
  let g111 = latticeGradient(vec3<i32>(i1.x, i1.y, i1.z));

  let c000 = dot(g000, f - vec3<f32>(0.0, 0.0, 0.0));
  let c100 = dot(g100, f - vec3<f32>(1.0, 0.0, 0.0));
  let c010 = dot(g010, f - vec3<f32>(0.0, 1.0, 0.0));
  let c110 = dot(g110, f - vec3<f32>(1.0, 1.0, 0.0));
  let c001 = dot(g001, f - vec3<f32>(0.0, 0.0, 1.0));
  let c101 = dot(g101, f - vec3<f32>(1.0, 0.0, 1.0));
  let c011 = dot(g011, f - vec3<f32>(0.0, 1.0, 1.0));
  let c111 = dot(g111, f - vec3<f32>(1.0, 1.0, 1.0));

  let x00 = mix(c000, c100, t.x);
  let x10 = mix(c010, c110, t.x);
  let x01 = mix(c001, c101, t.x);
  let x11 = mix(c011, c111, t.x);
  let y0 = mix(x00, x10, t.y);
  let y1 = mix(x01, x11, t.y);
  return mix(y0, y1, t.z);
}

// ridgedBand — one CHANNEL: base octave + 0.5x double-frequency octave,
// summed and remapped to [0,1] BEFORE the fold (ridged(fbm2(n)), not
// fbm(ridged(n)) — one V-shaped fold per band, same structure the
// single-octave code had, just fed a richer smooth field). The 0.5x-weight
// second octave adds amplitude 0.5 atop the base's 1.0, so the combined raw
// range is 1.5x a single octave's GRAD_BOUND; the clamp is a defensive
// backstop, not load-bearing (empirically the remap never clips).
fn ridgedBand(uv: vec3<f32>, freqMul: u32) -> f32 {
  let cells = BASE_CELLS * freqMul;
  let base = uv * f32(cells);
  let n0 = gradientNoise3D(base, cells);
  let n1 = gradientNoise3D(base * 2.0, cells * 2u);
  let raw = n0 + 0.5 * n1;
  let n = clamp(0.5 + 0.5 * raw / (1.5 * GRAD_BOUND), 0.0, 1.0);
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
