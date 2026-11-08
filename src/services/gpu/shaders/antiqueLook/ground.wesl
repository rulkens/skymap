// antiqueLook/ground.wesl — engraved ground for a body its plain render inks (`slopeInk` 1
// in ANTIQUE_RELIEF_BODIES: Mars), from `relief.wesl`'s texel `relief`. Owner ruling: the
// plain render says where ink goes and how much (its luma `plain` darker than the local
// wash or the plains round it, so a crater's shaded floor inks as well as a cast shadow),
// the light the direction: shade is hatched in one family at the plate's hatch angle (lines
// arriving and swelling with the tone, never closing to solid black, as on the globes). A
// steep landform the depth resolves (`relief.a` > 0) is hachured down its fall line
// instead, with a line on its crest; lit flats take a light stipple dotted where the
// ground's own noise peaks, so the dots stay on the ground as it moves.

import package::antiqueLook::engraving::crossHatch;
import package::antiqueLook::engraving::fallCrest;
import package::antiqueLook::engraving::fallLines;
import package::antiqueLook::engraving::inkLine;
import package::antiqueLook::engraving::quantileCut;
import package::antiqueLook::pigments::luma;

const GROUND_NOISE_SIGMA: f32 = 0.43;
// No hachure share past this, so paper always shows between the fall lines.
const GROUND_INK_CAP: f32 = 0.5;
// Darkness under the reference over which the shade's ink comes in; the hatch tone it
// reaches (`crossHatch`: lines from 0.06, wider from 0.5, crossed past 0.8) and spacing:
// short of the crossing, so the deepest shade is one set of lines, never a smear.
const GROUND_SHADE: vec2<f32> = vec2<f32>(0.06, 0.45);
const GROUND_TONE: f32 = 0.65;
const GROUND_HATCH: f32 = 3.6;
// The plains' two rings, in screen heights: past a big crater's wall at mid range.
const GROUND_SURROUND: vec2<f32> = vec2<f32>(0.08, 0.3);
// Shade is measured down from the lit ground round it (the rings' brightest tap, held to
// GROUND_LIT_SPAN of their mean: a white lander sets no standard), so a broad swell turned
// from the Sun shades as the plain shows it, not only what is darker than its neighbours.
const GROUND_LIT_SPAN: f32 = 1.3;
// The plain render's luma below which ground is shade wherever it lies (lit Martian
// ground prints ~0.25 in the print): a valley dark all round still inks, as the plain shows.
const GROUND_LIT_LUMA: f32 = 0.2;
// The print's luma from black to lit ground: the hatching's absolute tone ramp.
const GROUND_TONE_LUMA: vec2<f32> = vec2<f32>(0.03, 0.3);
// The lit crest's curvature (luma over the plains' per unit²) over which its line comes in,
// the span it is measured across (units), and how much brighter than the plains it stands.
const GROUND_CREST: vec2<f32> = vec2<f32>(0.004, 0.008);
const GROUND_CREST_SPAN: f32 = 6.0;
const GROUND_CREST_LIT: vec2<f32> = vec2<f32>(1.15, 1.4);

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
  var brightest = 0.0;
  for (var k = 0; k < 8; k++) {
    let a = f32(k) * 0.7853982 + 0.39;
    let r = select(GROUND_SURROUND.x, GROUND_SURROUND.y, (k & 1) == 1);
    let tap = washLuma(wash, samp, uv + vec2<f32>(cos(a) * res.y / res.x, sin(a)) * r, layer);
    mean += tap / 8.0;
    brightest = max(brightest, tap);
  }
  let reference = max(max(around, min(brightest, GROUND_LIT_SPAN * mean)), GROUND_LIT_LUMA);
  let dark = clamp(1.0 - plain / reference, 0.0, 1.0);
  let shade = smoothstep(GROUND_SHADE.x, GROUND_SHADE.y, dark);
  // The hatching's tone from the smooth wash, so its lines arrive and leave by rank where
  // the plain's grain and terraced bands would cut blocks; graded on the absolute tone
  // too, so mid-dark ground takes a light single hatch.
  let washShade = max(smoothstep(GROUND_SHADE.x, GROUND_SHADE.y, clamp(1.0 - around / reference, 0.0, 1.0)),
                      1.0 - smoothstep(GROUND_TONE_LUMA.x, GROUND_TONE_LUMA.y, around));
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
    ink = max(ink, crossHatch(form, p, GROUND_TONE * washShade * weight, GROUND_HATCH, hatchAngle, 1.0 / unit));
    let density = (0.03 + 0.25 * dark) * weight * (1.0 - shade);
    ink = max(ink, quantileCut(relief.b / GROUND_NOISE_SIGMA, density));
  }
  // The lit crest (a crater's rim, a ridge catching the light): a bright ridge in the
  // wash, from its Hessian over GROUND_CREST_SPAN units (a patch narrower draws none):
  // the centre a Newton step |gradient · v| / |λ| across, for the most negative curvature
  // λ and its direction v; drawn where the wash bends down that hard and stands brighter
  // than the plains round it, so the terrain's mottle draws no line.
  let o = GROUND_CREST_SPAN * unit / res;
  let e = washLuma(wash, samp, uv + vec2<f32>(o.x, 0.0), layer);
  let w = washLuma(wash, samp, uv - vec2<f32>(o.x, 0.0), layer);
  let so = washLuma(wash, samp, uv + vec2<f32>(0.0, o.y), layer);
  let no = washLuma(wash, samp, uv - vec2<f32>(0.0, o.y), layer);
  let se = washLuma(wash, samp, uv + o, layer);
  let nw = washLuma(wash, samp, uv - o, layer);
  let sw = washLuma(wash, samp, uv + vec2<f32>(-o.x, o.y), layer);
  let ne = washLuma(wash, samp, uv + vec2<f32>(o.x, -o.y), layer);
  let k = 1.0 / (GROUND_CREST_SPAN * GROUND_CREST_SPAN * max(mean, 1e-3));
  let hxx = (e + w - 2.0 * around) * k;
  let hyy = (so + no - 2.0 * around) * k;
  let hxy = (se + nw - sw - ne) * 0.25 * k;
  let lambda = 0.5 * (hxx + hyy) - sqrt(0.25 * (hxx - hyy) * (hxx - hyy) + hxy * hxy);
  let across = normalize(vec2<f32>(hxy, lambda - hxx) + vec2<f32>(1e-6, 0.0));
  let gradient = vec2<f32>(e - w, so - no) * (GROUND_CREST_SPAN * 0.5 * k);
  let off = abs(dot(gradient, across)) / max(-lambda, 1e-5);
  let crest = smoothstep(GROUND_CREST.x, GROUND_CREST.y, -lambda)
    * smoothstep(GROUND_CREST_LIT.x, GROUND_CREST_LIT.y, around / max(mean, 1e-3));
  return max(ink, inkLine(off, 1.4, 1.0 / unit) * crest);
}
