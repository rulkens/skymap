// antiqueLook/ground.wesl — engraved ground for a body its plain render inks (`slopeInk` 1
// in ANTIQUE_RELIEF_BODIES: Mars), from `relief.wesl`'s texel `relief`. Owner ruling: the
// plain render says where ink goes and how much (its luma `plain` darker than the brighter
// of the local wash and the plains round it, so a crater's shaded floor inks as well as a
// cast shadow), the relief only how: strokes along its field (the light's direction, or a
// steep landform's fall line), a second set along the contours in deep shadow, a line round
// each shade's edge and on every crest the depth resolves, and on a flat a stipple dotted
// where the ground's own noise peaks, so the dots stay on the ground as it moves. No share
// passes GROUND_INK_CAP, so paper shows between the strokes.

import package::antiqueLook::engraving::fallCrest;
import package::antiqueLook::engraving::fallLines;
import package::antiqueLook::engraving::inkLine;
import package::antiqueLook::engraving::quantileCut;
import package::antiqueLook::pigments::luma;

const GROUND_NOISE_SIGMA: f32 = 0.43;
const GROUND_INK_CAP: f32 = 0.5;
// Darkness under the reference over which the shade's ink comes in.
const GROUND_SHADE: vec2<f32> = vec2<f32>(0.1, 0.45);
// The plains' two rings, in screen heights: past a big crater's wall at mid range.
const GROUND_SURROUND: vec2<f32> = vec2<f32>(0.07, 0.2);
// The shade's edge: this darkness, drawn where it changes by at least `.y` per print
// unit (a shadow's edge, not a soft albedo drift); the gradient's span, units.
const GROUND_EDGE: vec2<f32> = vec2<f32>(0.3, 0.006);
const GROUND_EDGE_SPAN: f32 = 1.5;

fn washLuma(wash: texture_2d_array<f32>, samp: sampler, uv: vec2<f32>, layer: i32) -> f32 {
  return luma(textureSampleLevel(wash, samp, uv, layer, 0.0).rgb);
}

fn groundRelief(field: texture_2d<f32>, samp: sampler, px: vec2<f32>, relief: vec4<f32>, unit: f32,
                plain: f32, wash: texture_2d_array<f32>, layer: i32) -> f32 {
  if (relief.a < -1.5) {
    return 0.0;
  }
  let res = vec2<f32>(textureDimensions(field));
  let uv = px / res;
  let around = washLuma(wash, samp, uv, layer);
  // The lit plains: halfway between the ring's mean and its brightest tap.
  var mean = 0.0;
  var brightest = 0.0;
  for (var k = 0; k < 8; k++) {
    let a = f32(k) * 0.7853982 + 0.39;
    let r = select(GROUND_SURROUND.x, GROUND_SURROUND.y, (k & 1) == 1);
    let l = washLuma(wash, samp, uv + vec2<f32>(cos(a) * res.y / res.x, sin(a)) * r, layer);
    mean += l / 8.0;
    brightest = max(brightest, l);
  }
  let reference = max(max(around, 0.5 * (mean + brightest)), 1e-3);
  let dark = clamp(1.0 - plain / reference, 0.0, 1.0);
  let shade = smoothstep(GROUND_SHADE.x, GROUND_SHADE.y, dark);
  let shadow = smoothstep(0.45, 0.75, dark);
  let weight = min(abs(relief.a) * 1.5, 1.0);

  var ink = fallCrest(field, samp, px, unit);
  let share = GROUND_INK_CAP * shade * weight;
  if (share > 0.01) {
    ink = max(ink, quantileCut(fallLines(field, samp, px, unit, false), share));
  }
  if (shadow * weight > 0.05) {
    ink = max(ink, quantileCut(fallLines(field, samp, px, unit, true), 0.6 * GROUND_INK_CAP * shadow * weight));
  }
  if (relief.a < 0.0) {
    let detail = clamp((around - plain) * 5.0, 0.0, 1.0);
    let density = clamp(0.06 + 0.5 * pow(dark, 1.5) + 0.3 * detail, 0.0, 0.5) * 0.3 * -relief.a;
    ink = max(ink, quantileCut(relief.b / GROUND_NOISE_SIGMA, density));
  }

  // The shade's edge, on the smooth quarter-res wash: its distance in units from the
  // darkness's level crossing, over the darkness's slope.
  let o = GROUND_EDGE_SPAN * unit / res;
  let gx = washLuma(wash, samp, uv + vec2<f32>(o.x, 0.0), layer) - washLuma(wash, samp, uv - vec2<f32>(o.x, 0.0), layer);
  let gy = washLuma(wash, samp, uv + vec2<f32>(0.0, o.y), layer) - washLuma(wash, samp, uv - vec2<f32>(0.0, o.y), layer);
  let change = length(vec2<f32>(gx, gy)) / (2.0 * GROUND_EDGE_SPAN * reference);
  let level = abs(1.0 - around / reference - GROUND_EDGE.x) / max(change, 1e-4);
  ink = max(ink, inkLine(level, 1.0, 1.0 / unit) * smoothstep(GROUND_EDGE.y, 2.0 * GROUND_EDGE.y, change));
  return ink;
}
