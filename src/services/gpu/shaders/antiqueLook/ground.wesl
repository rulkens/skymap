// antiqueLook/ground.wesl — engraved ground for a body its plain render inks (`slopeInk` 1
// in ANTIQUE_RELIEF_BODIES: Mars), from `relief.wesl`'s texel `relief`. Owner ruling: the
// plain render says where ink goes and how much (its luma `plain` darker than the local
// wash or the plains round it, so a crater's shaded floor inks as well as a cast shadow),
// the light the direction: shade is hatched in one family at the plate's hatch angle (lines
// arriving and swelling with the tone, crossed only in deep shadow, as on the globes). A
// steep landform the depth resolves (`relief.a` > 0) is hachured down its fall line
// instead, with a line on its crest; lit flats take a light stipple dotted where the
// ground's own noise peaks, so the dots stay on the ground as it moves.

import package::antiqueLook::engraving::crossHatch;
import package::antiqueLook::engraving::fallCrest;
import package::antiqueLook::engraving::fallLines;
import package::antiqueLook::engraving::quantileCut;
import package::antiqueLook::pigments::luma;

const GROUND_NOISE_SIGMA: f32 = 0.43;
const GROUND_INK_CAP: f32 = 0.5;
// Darkness under the reference over which the shade's ink comes in; the hatch tone it
// reaches (`crossHatch`: lines from 0.06, wider from 0.5, crossed past 0.8) and spacing.
const GROUND_SHADE: vec2<f32> = vec2<f32>(0.06, 0.4);
const GROUND_TONE: f32 = 0.85;
const GROUND_HATCH: f32 = 3.0;
// The plains' two rings, in screen heights: past a big crater's wall at mid range.
const GROUND_SURROUND: vec2<f32> = vec2<f32>(0.07, 0.2);

fn washLuma(wash: texture_2d_array<f32>, samp: sampler, uv: vec2<f32>, layer: i32) -> f32 {
  return luma(textureSampleLevel(wash, samp, uv, layer, 0.0).rgb);
}

fn groundRelief(field: texture_2d<f32>, samp: sampler, px: vec2<f32>, relief: vec4<f32>, unit: f32,
                hatchAngle: f32, plain: f32, wash: texture_2d_array<f32>, layer: i32) -> f32 {
  if (relief.a < -1.5) {
    return 0.0;
  }
  let res = vec2<f32>(textureDimensions(field));
  let uv = px / res;
  let around = washLuma(wash, samp, uv, layer);
  var mean = 0.0;
  for (var k = 0; k < 8; k++) {
    let a = f32(k) * 0.7853982 + 0.39;
    let r = select(GROUND_SURROUND.x, GROUND_SURROUND.y, (k & 1) == 1);
    mean += washLuma(wash, samp, uv + vec2<f32>(cos(a) * res.y / res.x, sin(a)) * r, layer) / 8.0;
  }
  let reference = max(max(around, mean), 1e-3);
  let dark = clamp(1.0 - plain / reference, 0.0, 1.0);
  let shade = smoothstep(GROUND_SHADE.x, GROUND_SHADE.y, dark);
  let weight = min(abs(relief.a) * 1.5, 1.0);
  // A crest is too flat to be a landform itself: its line is sought on every pixel.
  var ink = fallCrest(field, samp, px, unit);
  if (relief.a > 0.0) {
    let share = GROUND_INK_CAP * shade * weight;
    if (share > 0.01) {
      ink = max(ink, quantileCut(fallLines(field, samp, px, unit, false), share));
    }
  } else {
    let p = px / unit;
    let n = vec2<f32>(-sin(hatchAngle), cos(hatchAngle));
    let form = vec3<f32>(dot(p, n), dot(p, vec2<f32>(n.y, -n.x)), 1.0);
    ink = max(ink, crossHatch(form, p, GROUND_TONE * shade * weight, GROUND_HATCH, hatchAngle, 1.0 / unit));
    let density = (0.06 + 0.3 * dark) * 0.3 * weight * (1.0 - shade);
    ink = max(ink, quantileCut(relief.b / GROUND_NOISE_SIGMA, density));
  }
  return ink;
}
