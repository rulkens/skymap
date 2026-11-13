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

fn vnoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21Hq(i);
  let b = hash21Hq(i + vec2<f32>(1.0, 0.0));
  let c = hash21Hq(i + vec2<f32>(0.0, 1.0));
  let d = hash21Hq(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm(p: vec2<f32>) -> f32 {
  var q = p;
  var amp = 0.5;
  var sum = 0.0;
  for (var k = 0; k < 5; k++) {
    sum += amp * vnoise(q);
    // Rotate between octaves so the lattice axes never line up into a grid.
    q = mat2x2<f32>(1.6, 1.2, -1.2, 1.6) * q + vec2<f32>(5.3, 1.7);
    amp *= 0.5;
  }
  return sum;
}

// Relief in [0,1]: fibre clumps, the laid/chain mould pattern (thinner pulp
// over the wires reads lighter in reflected light), long fibres along x.
fn paperRelief(p: vec2<f32>, seed: f32) -> f32 {
  let clumps = fbm(p * 0.09 + seed);
  let fibres = vnoise(vec2<f32>(p.x * 0.05, p.y * 0.9) + seed * 3.1);
  let laidPhase = p.y / LAID_PERIOD + 0.35 * vnoise(vec2<f32>(p.x * 0.01, seed));
  let laid = smoothstep(0.35, 0.5, abs(fract(laidPhase) - 0.5));
  let chainX = p.x + 6.0 * (vnoise(vec2<f32>(seed, p.y * 0.004)) - 0.5);
  let chain = 1.0 - smoothstep(0.6, 2.2, abs(fract(chainX / CHAIN_PERIOD + 0.5) - 0.5) * CHAIN_PERIOD);
  return clamp(0.55 * clumps + 0.25 * fibres + 0.12 * laid - 0.18 * chain + 0.1, 0.0, 1.0);
}

// Toning: oxidation browns the sheet from its edges inward, unevenly.
fn paperToning(uv: vec2<f32>, p: vec2<f32>, seed: f32) -> f32 {
  let edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  let ragged = edge + 0.035 * (fbm(p * 0.008 + seed * 1.7) - 0.5);
  return (1.0 - smoothstep(0.0, 0.16, ragged)) * 0.85 + 0.12 * fbm(p * 0.003 + seed);
}

// Foxing: sparse rust spots, a dark core in a pale halo, clustered by a slow field.
fn paperFoxing(p: vec2<f32>, seed: f32) -> f32 {
  let cellSize = 38.0;
  let cell = floor(p / cellSize);
  var fox = 0.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let c = cell + vec2<f32>(f32(i), f32(j));
      let h = hash21Hq(c + seed * 11.0);
      let cluster = fbm(c * 0.11 + seed * 5.0);
      if (h > 0.16 * smoothstep(0.42, 0.7, cluster)) {
        continue;
      }
      let centre = (c + vec2<f32>(hash21Hq(c + 3.1), hash21Hq(c + 7.7))) * cellSize;
      let r = mix(0.8, 5.5, hash21Hq(c + 1.3) * hash21Hq(c + 9.2));
      let d = length(p - centre) / r;
      let wobble = 0.35 * (vnoise((p - centre) * 0.9 + c) - 0.5);
      fox = max(fox, 1.0 - smoothstep(0.55, 1.0, d + wobble));
      fox = max(fox, 0.25 * (1.0 - smoothstep(1.0, 2.6, d)));
    }
  }
  return fox;
}

fn paperColor(uv: vec2<f32>, p: vec2<f32>, seed: f32) -> vec3<f32> {
  let relief = paperRelief(p, seed);
  var col = PAPER * (0.955 + 0.075 * relief);
  col = mix(col, TONED, paperToning(uv, p, seed) * 0.55);
  col = mix(col, FOX, paperFoxing(p, seed) * 0.55);
  return col;
}
