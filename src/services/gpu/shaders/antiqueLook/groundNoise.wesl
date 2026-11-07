// antiqueLook/groundNoise.wesl — the relief row's b channel, a noise pinned to the ground
// that the plate convolves along the fall line (`engraving.wesl` `fallLines`). Shared by
// every pass writing the row (`relief.wesl`, the Moon's `fsMoonRelief`), since FALL_SIGMA
// and the plate's stipple sigma are calibrated on exactly these statistics.

// Mirrors ANTIQUE_RELIEF_ANCHOR_LOG2 (data/rendering/antiqueRelief.ts).
const ANCHOR_LOG2: i32 = 12;
// The noise's lattice in print units: its convolved streaks come ~2 of these apart.
const NOISE_UNITS: f32 = 1.9;

fn pcg3(c: vec3<i32>) -> f32 {
  var v = vec3<u32>(c) * 1664525u + 1013904223u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  v ^= v >> vec3<u32>(16u);
  v.x += v.y * v.z;
  return f32(v.x) * (2.0 / 4294967295.0) - 1.0;
}

// Value noise on a 2^j m lattice, its cells counted from the body's centre: the
// anchor's whole cells come in as integers, so f32 only carries the remainder.
fn groundNoise(q: vec3<f32>, j: i32, anchorCells: vec3<i32>) -> f32 {
  let g = q / exp2(f32(j));
  let c = floor(g);
  let f = g - c;
  let s = f * f * (3.0 - 2.0 * f);
  let base = vec3<i32>(c) + anchorCells * (1i << u32(ANCHOR_LOG2 - j));
  let x00 = mix(pcg3(base), pcg3(base + vec3<i32>(1, 0, 0)), s.x);
  let x10 = mix(pcg3(base + vec3<i32>(0, 1, 0)), pcg3(base + vec3<i32>(1, 1, 0)), s.x);
  let x01 = mix(pcg3(base + vec3<i32>(0, 0, 1)), pcg3(base + vec3<i32>(1, 0, 1)), s.x);
  let x11 = mix(pcg3(base + vec3<i32>(0, 1, 1)), pcg3(base + vec3<i32>(1, 1, 1)), s.x);
  return mix(mix(x00, x10, s.y), mix(x01, x11, s.y), s.z);
}

// Two lattice octaves round NOISE_UNITS of screen, blended at constant contrast. q is
// metres from the anchor, metresPerUnit the ground a print unit spans there.
fn groundNoiseAt(q: vec3<f32>, anchorCells: vec3<i32>, metresPerUnit: f32) -> f32 {
  let jf = log2(metresPerUnit * NOISE_UNITS);
  let j0 = clamp(i32(floor(jf)), -6, ANCHOR_LOG2 - 1);
  let w = clamp(jf - f32(j0), 0.0, 1.0);
  return (groundNoise(q, j0, anchorCells) * (1.0 - w) + groundNoise(q, j0 + 1, anchorCells) * w)
    / sqrt((1.0 - w) * (1.0 - w) + w * w);
}
