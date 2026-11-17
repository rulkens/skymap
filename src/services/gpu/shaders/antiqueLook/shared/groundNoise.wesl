// antiqueLook/shared/groundNoise.wesl — the relief row's b channel, a noise pinned to the ground
// that the plate convolves along the fall line (`engraving.wesl` `fallLines`). Shared by
// every pass writing the row (`relief.wesl`, the Moon's `fsMoonRelief`), since FALL_SIGMA
// and the plate's stipple sigma are calibrated on exactly these statistics.

// Mirrors ANTIQUE_RELIEF_ANCHOR_LOG2 (data/rendering/antiqueRelief.ts).
const ANCHOR_LOG2: i32 = 12;
// The noise's lattice in print units: its convolved streaks come ~2 of these apart.
const NOISE_UNITS: f32 = 1.9;

fn pcg3(cell: vec3<i32>) -> f32 {
  var hashState = vec3<u32>(cell) * 1664525u + 1013904223u;
  hashState.x += hashState.y * hashState.z;
  hashState.y += hashState.z * hashState.x;
  hashState.z += hashState.x * hashState.y;
  hashState ^= hashState >> vec3<u32>(16u);
  hashState.x += hashState.y * hashState.z;
  return f32(hashState.x) * (2.0 / 4294967295.0) - 1.0;
}

// Value noise on a 2^j m lattice, its cells counted from the body's centre: the
// anchor's whole cells come in as integers, so f32 only carries the remainder.
fn groundNoise(anchorOffsetM: vec3<f32>, latticeLog2: i32, anchorCells: vec3<i32>) -> f32 {
  let latticeCoord = anchorOffsetM / exp2(f32(latticeLog2));
  let cellOrigin = floor(latticeCoord);
  let cellFrac = latticeCoord - cellOrigin;
  let eased = cellFrac * cellFrac * (3.0 - 2.0 * cellFrac);
  let base = vec3<i32>(cellOrigin) + anchorCells * (1i << u32(ANCHOR_LOG2 - latticeLog2));
  let x00 = mix(pcg3(base), pcg3(base + vec3<i32>(1, 0, 0)), eased.x);
  let x10 = mix(pcg3(base + vec3<i32>(0, 1, 0)), pcg3(base + vec3<i32>(1, 1, 0)), eased.x);
  let x01 = mix(pcg3(base + vec3<i32>(0, 0, 1)), pcg3(base + vec3<i32>(1, 0, 1)), eased.x);
  let x11 = mix(pcg3(base + vec3<i32>(0, 1, 1)), pcg3(base + vec3<i32>(1, 1, 1)), eased.x);
  return mix(mix(x00, x10, eased.y), mix(x01, x11, eased.y), eased.z);
}

// Two lattice octaves round NOISE_UNITS of screen, blended at constant contrast. anchorOffsetM is
// metres from the anchor, metresPerUnit the ground a print unit spans there.
fn groundNoiseAt(anchorOffsetM: vec3<f32>, anchorCells: vec3<i32>, metresPerUnit: f32) -> f32 {
  let octaveFloat = log2(metresPerUnit * NOISE_UNITS);
  let octaveLow = clamp(i32(floor(octaveFloat)), -6, ANCHOR_LOG2 - 1);
  let octaveBlend = clamp(octaveFloat - f32(octaveLow), 0.0, 1.0);
  return (groundNoise(anchorOffsetM, octaveLow, anchorCells) * (1.0 - octaveBlend) + groundNoise(anchorOffsetM, octaveLow + 1, anchorCells) * octaveBlend)
    / sqrt((1.0 - octaveBlend) * (1.0 - octaveBlend) + octaveBlend * octaveBlend);
}
