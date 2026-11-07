// antiqueLook/bodies/mars.wesl — Mars as the first telescopic drawings showed it:
// its dark markings (Huygens' 1659 Syrtis Major) are darker engraved tone, a burin
// family of its own thickening with the albedo, and a thin red-lead wash pooling
// in it. No coast, no water: Mars has no water edges. Reads the lightness its
// albedo mask fed the land row (`ANTIQUE_ALBEDO_MASK`), 0 on the darkest ground.

import package::antiqueLook::plateBodies::BodyPrint;
import package::antiqueLook::engraving::crossHatch;
import package::antiqueLook::engraving::fallLines;
import package::antiqueLook::engraving::quantileCut;
import package::antiqueLook::pigments::applyWash;
import package::antiqueLook::pigments::pigmentAt;

// The darkest marking's tone: one family (the first starts near 0.5 in
// `crossHatch`), never crossed, so the shade's own hatching still reads over it.
const MARS_ALBEDO_TONE: f32 = 0.62;
// Finer than the shade's hatching, print units, along the latitude (`form`): the
// shade's lines bow round the subsolar point, which drew a target on a marking there.
const MARS_HATCH: f32 = 3.2;
const MARS_WASH: f32 = 0.3;

// `cover` scales the wash: body coverage times the plate's inside.
fn marsPrint(col: vec3<f32>, cover: f32, lightness: f32, form: vec3<f32>, p: vec2<f32>, pxUnits: f32) -> BodyPrint {
  let dark = 1.0 - lightness;
  let ink = crossHatch(form, p, MARS_ALBEDO_TONE * dark, MARS_HATCH, 0.0, pxUnits);
  return BodyPrint(applyWash(col, pigmentAt(3.0), MARS_WASH * dark * cover), ink);
}

// Its ground (treatment (d), `relief.wesl`'s texel `relief`): fall-line hachures inking
// the share the plate light's shade and the slope ask for, a second set along the
// contours in the deepest shade and across a cast shadow (the plain render `plain`
// dark against its surroundings `around`), and on the flats stipple by that darkness,
// dotted where the ground's own noise peaks so the dots stay on the ground as it moves;
// a flat in cast shadow is cross-hatched straight, having no fall line to follow.
const MARS_NOISE_SIGMA: f32 = 0.43;
const MARS_SHADOW_HATCH_ANGLE: f32 = 0.7;

fn marsRelief(field: texture_2d<f32>, samp: sampler, px: vec2<f32>, relief: vec4<f32>, unit: f32,
              plain: f32, around: f32) -> f32 {
  let dark = clamp(1.0 - plain / max(1.3 * around, 1e-3), 0.0, 1.0);
  let shadow = smoothstep(0.45, 0.75, dark);
  if (relief.a > 0.0) {
    var ink = quantileCut(fallLines(field, samp, px, unit, false), relief.a);
    let deep = max(smoothstep(0.5, 0.75, relief.a), shadow);
    if (deep > 0.0) {
      ink = max(ink, quantileCut(fallLines(field, samp, px, unit, true), 0.45 * deep));
    }
    return ink;
  }
  if (relief.a < 0.0 && relief.a > -1.5) {
    let detail = clamp((around - plain) * 5.0, 0.0, 1.0);
    let density = clamp(0.06 + 0.5 * pow(dark, 1.5) + 0.3 * detail, 0.0, 0.5) * 0.3 * -relief.a;
    var ink = quantileCut(relief.b / MARS_NOISE_SIGMA, density);
    if (shadow > 0.0) {
      let p = px / unit;
      let n = vec2<f32>(-sin(MARS_SHADOW_HATCH_ANGLE), cos(MARS_SHADOW_HATCH_ANGLE));
      let form = vec3<f32>(dot(p, n), dot(p, vec2<f32>(n.y, -n.x)), 1.0);
      ink = max(ink, crossHatch(form, p, 0.3 + 0.6 * shadow, MARS_HATCH, MARS_SHADOW_HATCH_ANGLE, 1.0 / unit));
    }
    return ink;
  }
  return 0.0;
}
