// lib/film.wesl — the film look's helpers for the compositor's FILM variant: a
// PCG integer hash, the analogue grain field, and the lateral chromatic-
// aberration spectrum. Integer hashing, not sin(dot()): the float hash repeats
// visibly once its argument passes a few thousand, which every frame seed does.

// pcg3d (Jarzynski & Olano 2020): three independent u32 streams from three.
fn pcg3d(v: vec3<u32>) -> vec3<u32> {
  var p = v * 1664525u + 1013904223u;
  p.x += p.y * p.z;
  p.y += p.z * p.x;
  p.z += p.x * p.y;
  p ^= p >> vec3<u32>(16u);
  p.x += p.y * p.z;
  p.y += p.z * p.x;
  p.z += p.x * p.y;
  return p;
}

// Uniform 0..1 per channel for one lattice cell of one frame.
fn cellNoise(cell: vec2<i32>, seed: u32) -> vec3<f32> {
  let h = pcg3d(vec3<u32>(bitcast<u32>(cell.x), bitcast<u32>(cell.y), seed));
  return vec3<f32>(h) * (1.0 / 4294967296.0);
}

// Smooth value noise over a lattice of 'size' px: soft clumps, not pixel salt.
fn grainLayer(px: vec2<f32>, size: f32, seed: u32) -> vec3<f32> {
  let p = px / size;
  let cell = vec2<i32>(floor(p));
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let n00 = cellNoise(cell, seed);
  let n10 = cellNoise(cell + vec2<i32>(1, 0), seed);
  let n01 = cellNoise(cell + vec2<i32>(0, 1), seed);
  let n11 = cellNoise(cell + vec2<i32>(1, 1), seed);
  return mix(mix(n00, n10, w.x), mix(n01, n11, w.x), w.y);
}

// A grain-sized lattice plus a half-size one sum to a near-Gaussian zero-mean
// field (std ~0.22 per channel). Each frame slides the lattice by a random
// sub-cell offset so the grid itself never registers.
fn filmGrain(px: vec2<f32>, size: f32, seed: u32) -> vec3<f32> {
  let slide = cellNoise(vec2<i32>(7, 13), seed).xy * size;
  let coarse = grainLayer(px + slide, size, seed) - vec3<f32>(0.5);
  let fine = grainLayer(px - slide.yx, size * 0.5, seed + 0x9E3779B9u) - vec3<f32>(0.5);
  return coarse + 0.5 * fine;
}

// Tap colour along the aberration smear, t 0 (blue end) to 1 (red end). The
// three lobes overlap so the taps sum to a smooth, near-white weight.
fn caSpectrum(t: f32) -> vec3<f32> {
  let r = smoothstep(0.4, 0.8, t);
  let g = 1.0 - smoothstep(0.0, 0.45, abs(t - 0.5));
  let b = 1.0 - smoothstep(0.2, 0.6, t);
  return vec3<f32>(r, g, b);
}
