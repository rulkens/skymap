// antiqueLook/shared/paper.wesl — hand-made laid paper, screen-locked (a print does not
// move with the camera). Coordinates are print units (`AntiqueUniforms.unit`),
// so the sheet keeps its grain at any DPR. Scale: the window is read as a plate
// ~45 cm wide, so 1 mm ≈ 3.5 units.

import package::lib::util::hash21Hq;

const PAPER: vec3<f32> = vec3<f32>(0.918, 0.866, 0.742);
const TONED: vec3<f32> = vec3<f32>(0.80, 0.69, 0.50);
const FOX: vec3<f32> = vec3<f32>(0.62, 0.42, 0.24);
// Laid lines ~9 per cm, chain lines ~25 mm apart (17th-c. Dutch moulds).
const LAID_PERIOD: f32 = 3.9;
const CHAIN_PERIOD: f32 = 88.0;

fn vnoise(coord: vec2<f32>) -> f32 {
  let cell = floor(coord);
  let cellFrac = fract(coord);
  let eased = cellFrac * cellFrac * (3.0 - 2.0 * cellFrac);
  let corner00 = hash21Hq(cell);
  let corner10 = hash21Hq(cell + vec2<f32>(1.0, 0.0));
  let corner01 = hash21Hq(cell + vec2<f32>(0.0, 1.0));
  let corner11 = hash21Hq(cell + vec2<f32>(1.0, 1.0));
  return mix(mix(corner00, corner10, eased.x), mix(corner01, corner11, eased.x), eased.y);
}

fn fbm(coord: vec2<f32>) -> f32 {
  var warped = coord;
  var amp = 0.5;
  var sum = 0.0;
  for (var octave = 0; octave < 5; octave++) {
    sum += amp * vnoise(warped);
    // Rotate between octaves so the lattice axes never line up into a grid.
    warped = mat2x2<f32>(1.6, 1.2, -1.2, 1.6) * warped + vec2<f32>(5.3, 1.7);
    amp *= 0.5;
  }
  return sum;
}

// Relief in [0,1]: fibre clumps, the laid/chain mould pattern (thinner pulp
// over the wires reads lighter in reflected light), long fibres along x.
fn paperRelief(coord: vec2<f32>, seed: f32) -> f32 {
  let clumps = fbm(coord * 0.09 + seed);
  let fibres = vnoise(vec2<f32>(coord.x * 0.05, coord.y * 0.9) + seed * 3.1);
  let laidPhase = coord.y / LAID_PERIOD + 0.35 * vnoise(vec2<f32>(coord.x * 0.01, seed));
  let laid = smoothstep(0.35, 0.5, abs(fract(laidPhase) - 0.5));
  let chainX = coord.x + 6.0 * (vnoise(vec2<f32>(seed, coord.y * 0.004)) - 0.5);
  let chain = 1.0 - smoothstep(0.6, 2.2, abs(fract(chainX / CHAIN_PERIOD + 0.5) - 0.5) * CHAIN_PERIOD);
  return clamp(0.55 * clumps + 0.25 * fibres + 0.12 * laid - 0.18 * chain + 0.1, 0.0, 1.0);
}

// Toning: oxidation browns the sheet from its edges inward, unevenly.
fn paperToning(uv: vec2<f32>, coord: vec2<f32>, seed: f32) -> f32 {
  let edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  let ragged = edge + 0.035 * (fbm(coord * 0.008 + seed * 1.7) - 0.5);
  return (1.0 - smoothstep(0.0, 0.16, ragged)) * 0.85 + 0.12 * fbm(coord * 0.003 + seed);
}

// Foxing: sparse rust spots, a dark core in a pale halo, clustered by a slow field.
fn paperFoxing(coord: vec2<f32>, seed: f32) -> f32 {
  let cellSize = 38.0;
  let cell = floor(coord / cellSize);
  var fox = 0.0;
  for (var cellRow = -1; cellRow <= 1; cellRow++) {
    for (var cellCol = -1; cellCol <= 1; cellCol++) {
      let spotCell = cell + vec2<f32>(f32(cellCol), f32(cellRow));
      let spotHash = hash21Hq(spotCell + seed * 11.0);
      let cluster = fbm(spotCell * 0.11 + seed * 5.0);
      if (spotHash > 0.16 * smoothstep(0.42, 0.7, cluster)) {
        continue;
      }
      let centre = (spotCell + vec2<f32>(hash21Hq(spotCell + 3.1), hash21Hq(spotCell + 7.7))) * cellSize;
      let spotRadius = mix(0.8, 5.5, hash21Hq(spotCell + 1.3) * hash21Hq(spotCell + 9.2));
      let spotDist = length(coord - centre) / spotRadius;
      let wobble = 0.35 * (vnoise((coord - centre) * 0.9 + spotCell) - 0.5);
      fox = max(fox, 1.0 - smoothstep(0.55, 1.0, spotDist + wobble));
      fox = max(fox, 0.25 * (1.0 - smoothstep(1.0, 2.6, spotDist)));
    }
  }
  return fox;
}

fn paperColor(uv: vec2<f32>, coord: vec2<f32>, seed: f32) -> vec3<f32> {
  let relief = paperRelief(coord, seed);
  var col = PAPER * (0.955 + 0.075 * relief);
  col = mix(col, TONED, paperToning(uv, coord, seed) * 0.55);
  col = mix(col, FOX, paperFoxing(coord, seed) * 0.55);
  return col;
}
