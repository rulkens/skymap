// antiqueLook/bodies/moon.wesl — the Moon as Grimaldi engraved it for Riccioli (1651),
// from its own pass's relief row (`texturedBody/fragment.wesl` `fsMoonPrint`): r the
// albedo over ~7 px, g 2 + the terrain's light (0 = no Moon), b rim ink (+2 inside a
// bright-floored crater), a the albedo over ~24 px. Darkness is line WIDTH at a constant pitch, never a line count or a
// grey: every line of a family is cut once its tone starts, so no density steps
// (barcodes) and no grey where lines crowd. The maria are level lines, the highlands
// paper; no coast, no wash (owner ruling). The shade follows the terrain's light, so
// the terminator is ragged with lit peaks and crater shadows.

import package::lib::util::hash21Hq;

// Lommel–Seeliger brightness 2·L/(L + ndv) on the terrain's light L: ~1 across the
// whole full disc (no limb darkening), falling only at the terminator. Paper from 0.16
// (a Sun ~5° up): the plain's exposure shows ground that grazing light as lit, so only
// the night and the relief's shadows at its edge print as shade, a ragged terminator.
const LS_GROUND = vec2<f32>(-0.03, 0.16);
// By day a slope turned from the Sun, its light over the smooth ground's (full shade
// .. none), prints up to SLOPE_TONE: crater walls and hills, never the night's weight.
const SLOPE_RATIO = vec2<f32>(0.1, 0.45);
const SLOPE_TONE: f32 = 0.62;
// Shade lines start at this tone (below it a slope barely off the ground's light would
// print a rain of loose dashes) and reach their widest at the cap.
const SHADE_START: f32 = 0.22;
const MOON_SHADE_CAP: f32 = 0.72;
// Shade line widths at the start .. at the cap, print units; the pitch both families
// share, wider than the planets' 3.2 so a 1:1 line reads as a cut, not a scan line.
const SHADE_W = vec2<f32>(0.5, 2.0);
const MOON_PITCH: f32 = 4.6;
// Linear albedo: lines start at the shore and are at body width by the mare body; the
// darkest cores (Crisium, Tranquillitatis) swell by MARE_CORE_W. A patch counts as sea
// only where the wide albedo (~170 km) is darker than MARE_SUPPORT too: a walled
// plain's dark floor or a dusky highland patch is no sea.
const MARE_SHORE: f32 = 0.25;
const MARE_BODY: f32 = 0.165;
const MARE_SUPPORT: f32 = 0.19;
const MARE_CORE = vec2<f32>(0.105, 0.075);
const MARE_W = vec2<f32>(0.8, 1.4);
const MARE_CORE_W: f32 = 0.8;
// The mare taps along a line's centre row, print units apart: with the pass's own blur
// a ~7 px mask, so a mare's edge is a line's tapered end, not a staircase.
const MARE_TAP_UNITS: f32 = 3.0;

// tone: the shade's, capped; shade: uncapped; litSlope: how far a slope is turned to
// the Sun beyond the smooth globe (a lit wall inside a mare stays white).
struct MoonTone {
  tone: f32,
  shade: f32,
  litSlope: f32,
}

fn moonTone(ndl: f32, ndv: f32, row: f32) -> MoonTone {
  let lit = select(ndl, row - 2.0, row > 0.0);
  let rim = 1.0 - smoothstep(0.0, 0.5, ndv);
  let brightness = 2.0 * lit / max(abs(lit) + max(ndv, 0.02), 1e-4);
  let ground = clamp(1.0 - smoothstep(LS_GROUND.x, LS_GROUND.y, brightness)
                     - 0.5 * rim * smoothstep(0.05, -0.25, lit), 0.0, 1.0);
  let slope = SLOPE_TONE * smoothstep(SLOPE_RATIO.y, SLOPE_RATIO.x, lit / max(ndl, 0.05)) * step(0.0, ndl);
  let shade = max(ground, slope);
  return MoonTone(min(shade, MOON_SHADE_CAP), shade, smoothstep(0.1, 0.28, lit - ndl));
}

// A shade line runs at least 2 × SHADE_DASH units: the tone is eroded along the line
// (`along`: device px per unit along it), so a slope too short for a stroke prints none
// and a stroke's ends taper.
const SHADE_DASH: f32 = 8.0;

// Night the plain render still shows (its ambient light on the albedo's baked relief,
// display luma over SEEN_LUMA) prints at SEEN_CAP, lighter than the night it shows black.
const SEEN_LUMA = vec2<f32>(0.04, 0.09);
const SEEN_CAP: f32 = 0.5;

fn moonToneAlong(field: texture_2d<f32>, ip: vec2<i32>, along: vec2<f32>, ndl: f32, ndv: f32,
                 row: f32, plain: f32) -> MoonTone {
  let here = moonTone(ndl, ndv, row);
  let size = vec2<i32>(textureDimensions(field));
  let o = vec2<i32>(round(along * SHADE_DASH));
  let ahead = moonTone(ndl, ndv, textureLoad(field, clamp(ip + o, vec2<i32>(0), size - 1), 0).g).tone;
  let behind = moonTone(ndl, ndv, textureLoad(field, clamp(ip - o, vec2<i32>(0), size - 1), 0).g).tone;
  let cap = mix(MOON_SHADE_CAP, SEEN_CAP, smoothstep(SEEN_LUMA.x, SEEN_LUMA.y, plain));
  return MoonTone(min(min(here.tone, 0.5 * (ahead + behind)), cap), here.shade, here.litSlope);
}

// The shade's lines along `form` (phase, along, |d phase / d unit|): all cut from
// SHADE_START, a line's end staggered by its own hash, swelling with the tone. Where the
// globe crowds them at the limb every other line thins out before they merge.
fn moonShade(form: vec3<f32>, tone: f32, pxUnits: f32) -> f32 {
  if (tone < SHADE_START) {
    return 0.0;
  }
  let v = form.x / MOON_PITCH;
  let k = floor(v);
  let t = clamp((tone - SHADE_START - 0.08 * hash21Hq(vec2<f32>(k, 3.1))) / (MOON_SHADE_CAP - SHADE_START), 0.0, 1.0);
  let local = MOON_PITCH / max(form.z, 1.0);
  let odd = f32(i32(k) & 1);
  let thin = mix(1.0, smoothstep(2.5, 4.0, local / pxUnits), odd);
  let hw = min(0.5 * mix(SHADE_W.x, SHADE_W.y, t) * smoothstep(0.0, 0.15, t), 0.35 * local) * thin;
  let d = abs(fract(v) - 0.5) * MOON_PITCH / max(form.z, 1e-3);
  return (1.0 - smoothstep(hw - 0.5 * pxUnits, hw + 0.5 * pxUnits, d)) * step(0.15 * pxUnits, hw);
}

// The maria's level lines, on whole device px so every line prints alike: the albedo
// read along the line's own centre row (the mask is the line's, not the pixel's), a
// patch admitted as sea only with the wide albedo's support (a threshold with
// hysteresis), ends staggered and tapered.
fn moonMare(field: texture_2d<f32>, px: vec2<f32>, unit: f32, moon: MoonTone) -> f32 {
  let pitch = max(round(MOON_PITCH * unit), 3.0);
  let k = floor(px.y / pitch);
  let yc = k * pitch + floor(0.5 * pitch) + 0.5;
  let size = vec2<i32>(textureDimensions(field));
  var near = 0.0;
  var wide = 0.0;
  for (var j = -2; j <= 2; j++) {
    let at = vec2<i32>(i32(px.x + f32(j) * MARE_TAP_UNITS * unit), i32(yc));
    let s = textureLoad(field, clamp(at, vec2<i32>(0), size - 1), 0);
    // Off the disc reads as highland, so a sea at the limb still ends in a taper.
    near += select(0.7, s.r, s.g > 0.0);
    wide += select(0.7, s.a, s.g > 0.0);
  }
  let albedo = near * near / 25.0;
  let support = smoothstep(MARE_SHORE, MARE_SUPPORT, wide * wide / 25.0);
  let sea = smoothstep(MARE_SHORE, MARE_BODY, albedo);
  let t = sea * support - 0.12 * hash21Hq(vec2<f32>(k, 7.7));
  if (t <= 0.0) {
    return 0.0;
  }
  let core = smoothstep(MARE_CORE.x, MARE_CORE.y, albedo);
  // Thinner across the shade's own lines, so a mare at night is a darker weave, not a grid.
  let night = 1.0 - 0.45 * smoothstep(0.45, MOON_SHADE_CAP, moon.tone);
  let width = (mix(MARE_W.x, MARE_W.y, t) + MARE_CORE_W * core) * smoothstep(0.0, 0.2, t) * night * unit;
  return (1.0 - smoothstep(0.5 * width - 0.5, 0.5 * width + 0.5, abs(px.y - yc))) * (1.0 - moon.litSlope);
}

// The plate's Moon arm: the mare lines (cleared inside a bright-floored crater, as the
// pass flags it in b's 2s place: Aristarchus, Copernicus) under the rims, which drop out
// in the deepest shade, where a line in a solid reads as mush.
fn moonInk(field: texture_2d<f32>, px: vec2<f32>, unit: f32, moon: MoonTone, b: f32) -> f32 {
  let clear = step(1.5, b);
  let rims = (b - 2.0 * clear) * (1.0 - smoothstep(0.88, 0.98, moon.shade));
  return max(moonMare(field, px, unit, moon) * (1.0 - clear), rims);
}
