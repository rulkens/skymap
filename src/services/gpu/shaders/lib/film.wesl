// lib/film.wesl — the film look's helpers for the compositor's FILM variant: a
// PCG integer hash, the analogue grain field, and the lateral chromatic-
// aberration spectrum. Integer hashing, not sin(dot()): the float hash repeats
// visibly once its argument passes a few thousand, which every frame seed does.

// pcg3d (Jarzynski & Olano 2020): three independent u32 streams from three.
fn pcg3d(seed: vec3<u32>) -> vec3<u32> {
  var state = seed * 1664525u + 1013904223u;
  state.x += state.y * state.z;
  state.y += state.z * state.x;
  state.z += state.x * state.y;
  state ^= state >> vec3<u32>(16u);
  state.x += state.y * state.z;
  state.y += state.z * state.x;
  state.z += state.x * state.y;
  return state;
}

// Uniform 0..1 per channel for one lattice cell of one frame.
fn cellNoise(cell: vec2<i32>, seed: u32) -> vec3<f32> {
  let hash = pcg3d(vec3<u32>(bitcast<u32>(cell.x), bitcast<u32>(cell.y), seed));
  return vec3<f32>(hash) * (1.0 / 4294967296.0);
}

// Smooth value noise over a lattice of 'cellPx' px: soft clumps, not pixel salt.
fn grainLayer(pixel: vec2<f32>, cellPx: f32, seed: u32) -> vec3<f32> {
  let lattice = pixel / cellPx;
  let cell = vec2<i32>(floor(lattice));
  let inCell = fract(lattice);
  let fade = inCell * inCell * (3.0 - 2.0 * inCell);
  let noiseOrigin = cellNoise(cell, seed);
  let noiseRight = cellNoise(cell + vec2<i32>(1, 0), seed);
  let noiseUp = cellNoise(cell + vec2<i32>(0, 1), seed);
  let noiseDiagonal = cellNoise(cell + vec2<i32>(1, 1), seed);
  return mix(mix(noiseOrigin, noiseRight, fade.x), mix(noiseUp, noiseDiagonal, fade.x), fade.y);
}

// A grain-sized lattice plus a half-size one sum to a near-Gaussian zero-mean
// field (std ~0.22 per channel). Each frame slides the lattice by a random
// sub-cell offset so the grid itself never registers.
fn filmGrain(pixel: vec2<f32>, grainPx: f32, seed: u32) -> vec3<f32> {
  let slide = cellNoise(vec2<i32>(7, 13), seed).xy * grainPx;
  let coarse = grainLayer(pixel + slide, grainPx, seed) - vec3<f32>(0.5);
  let fine = grainLayer(pixel - slide.yx, grainPx * 0.5, seed + 0x9E3779B9u) - vec3<f32>(0.5);
  return coarse + 0.5 * fine;
}

// Tap colour along the aberration smear, 'along' 0 (blue end) to 1 (red end).
// The three lobes overlap so the taps sum to a smooth, near-white weight.
fn caSpectrum(along: f32) -> vec3<f32> {
  let red = smoothstep(0.4, 0.8, along);
  let green = 1.0 - smoothstep(0.0, 0.45, abs(along - 0.5));
  let blue = 1.0 - smoothstep(0.2, 0.6, along);
  return vec3<f32>(red, green, blue);
}
