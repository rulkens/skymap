// antiqueLook/bodies/mars.wesl — Mars as the first telescopic drawings showed it:
// its dark markings (Huygens' 1659 Syrtis Major) are darker engraved tone, a burin
// family of its own thickening with the albedo, all under one thin red-lead wash.
// No coast, no water: Mars has no water edges. Reads the lightness its albedo mask fed the land row (`ANTIQUE_ALBEDO_MASK`), 0 on the darkest ground.

import package::antiqueLook::shared::plateBodies::BodyPrint;
import package::antiqueLook::shared::engraving::crossHatch;
import package::antiqueLook::shared::pigments::applyWash;
import package::antiqueLook::shared::pigments::pigmentAt;

// The darkest marking's tone: one family (the first starts near 0.5 in
// `crossHatch`), never crossed, so the shade's own hatching still reads over it.
const MARS_ALBEDO_TONE: f32 = 0.62;
// Finer than the shade's hatching, print units, along the latitude (`form`): the
// shade's lines bow round the subsolar point, which drew a target on a marking there.
const MARS_HATCH: f32 = 3.2;
// The coarsest latitude step, radians; the lines sit on its power-of-two fractions.
const MARS_LAT_STEP: f32 = 0.7853982;
// Even over the whole body, never by albedo: the albedo class fills the screen up close,
// so a wash pooling in the markings tinted the disc's markings only and flooded a close-up.
const MARS_WASH: f32 = 0.16;

// `cover` scales the wash: body coverage times the plate's inside. `form` is the latitude
// times `radius`, the globe's apparent radius (print units).
fn marsPrint(col: vec3<f32>, cover: f32, lightness: f32, form: vec3<f32>, radius: f32, p: vec2<f32>, pxUnits: f32) -> BodyPrint {
  let ink = latitudeHatch(form, max(radius, 1e-6), MARS_ALBEDO_TONE * (1.0 - lightness), p, pxUnits);
  return BodyPrint(applyWash(col, pigmentAt(3.0), MARS_WASH * cover), ink);
}

// Lines on whole fractions of MARS_LAT_STEP, the step halving each time the globe doubles
// and cross-faded over the octave, as `isoLines` does: a phase of radius × latitude slid
// every line with the apparent radius, so a pose a hair off redrew all the markings.
fn latitudeHatch(form: vec3<f32>, radius: f32, tone: f32, p: vec2<f32>, pxUnits: f32) -> f32 {
  let lat = form.x / radius;
  let o = log2(radius * MARS_LAT_STEP / MARS_HATCH);
  let o0 = floor(o);
  var ink = 0.0;
  for (var n = 0; n < 2; n++) {
    let perRad = MARS_HATCH / MARS_LAT_STEP * exp2(o0 + f32(n));
    let pinned = vec3<f32>(lat * perRad, form.y, form.z / radius * perRad);
    ink += select(1.0 - (o - o0), o - o0, n == 1) * crossHatch(pinned, p, tone, MARS_HATCH, 0.0, pxUnits);
  }
  return ink;
}
