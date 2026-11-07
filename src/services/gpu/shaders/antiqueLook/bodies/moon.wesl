// antiqueLook/bodies/moon.wesl — the Moon as Grimaldi engraved it for Riccioli (1651),
// from its own row (`moonRow.wesl`, the plate's `moon` layer; a negative layer: the pass
// did not run). Darkness is line WIDTH at a constant pitch, never a line count or a
// grey: every line of a family is cut once its tone starts, so no density steps
// (barcodes) and no grey where lines crowd. The maria are level lines, the highlands
// paper; no coast, no wash (owner ruling). The shade follows the terrain's light, so
// the terminator is ragged with lit peaks and crater shadows.

import package::lib::util::hash21Hq;
import package::antiqueLook::bodies::moonRow::decodeMoonRow;
import package::antiqueLook::engraving::fallCrest;
import package::antiqueLook::engraving::fallLines;
import package::antiqueLook::engraving::quantileCut;

// Lommel–Seeliger brightness 2·L/(L + ndv) on the terrain's light L: ~1 across the
// whole full disc (no limb darkening), falling only at the terminator. Paper from 0.16
// (a Sun ~5° up): the plain's exposure shows ground that grazing light as lit, so only
// the night and the relief's shadows at its edge print as shade, a ragged terminator.
const LS_GROUND = vec2<f32>(-0.03, 0.16);
// By day a slope turned from the Sun, its light over the smooth ground's (full shade
// .. none), prints up to SLOPE_TONE: crater walls and hills, never the night's weight.
const SLOPE_RATIO = vec2<f32>(0.15, 0.55);
const SLOPE_TONE: f32 = 0.62;
// Shade lines start at this tone (below it a slope barely off the ground's light would
// print a rain of loose dashes) and reach their widest at the cap.
const SHADE_START: f32 = 0.22;
const MOON_SHADE_CAP: f32 = 0.72;
// Shade line widths at the start .. at the cap, print units; the pitch both families
// share, wider than the planets' 3.2 so a 1:1 line reads as a cut, not a scan line.
const SHADE_W = vec2<f32>(0.5, 2.0);
const MOON_PITCH: f32 = 4.6;
// Linear albedo: a line is cut where its ground is darker than MARE_ON, and carried out
// to MARE_OFF only beside such a core (hysteresis), so a dusky highland (the Apennines
// ~0.17, Haemus ~0.14) stays paper while a sea's pale shore still prints. A patch counts
// as sea only where the wide albedo (~170 km) is darker than MARE_SUPPORT too: a walled
// plain's dark floor is no sea. A line swells from MARE_CORE.x to its heaviest weight
// at MARE_CORE.y, the darkest cores (Crisium, Tranquillitatis).
const MARE_ON: f32 = 0.13;
const MARE_OFF: f32 = 0.155;
const MARE_SUPPORT: f32 = 0.24;
const MARE_CORE = vec2<f32>(0.125, 0.065);
// Line weights as shares of the pitch, cut to whole device px: the lightest .. the
// heaviest, at most 60% of the pitch so paper always shows between lines; MARE_WEIGHTS
// steps between them, so a swell is a hard-edged step, never an anti-aliased grey.
const MARE_SHARE = vec2<f32>(0.2, 0.6);
const MARE_WEIGHTS: f32 = 3.0;
// The mare taps along a line's centre row, print units apart: a line's end steps down
// its weights over the two taps it takes to leave the sea (~6 px), a tapered end.
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
  // Faded out before the smooth terminator, where the ratio's divisor vanishes: a uniform
  // band of it ending at ndl = 0 printed a ruler-straight edge the relief could not break.
  let slope = SLOPE_TONE * smoothstep(SLOPE_RATIO.y, SLOPE_RATIO.x, lit / max(ndl, 0.05)) * smoothstep(0.03, 0.12, ndl);
  let shade = max(ground, slope);
  return MoonTone(min(shade, MOON_SHADE_CAP), shade, smoothstep(0.1, 0.28, lit - ndl));
}

// A shade line runs at least 2 × SHADE_DASH units: the tone is eroded along the line
// (`along`: device px per unit along it), so a slope too short for a stroke prints none
// and a stroke's ends taper.
const SHADE_DASH: f32 = 10.0;

// Night the plain render still shows (its ambient light on the albedo's baked relief,
// display luma over SEEN_LUMA) prints at SEEN_CAP, lighter than the night it shows black.
const SEEN_LUMA = vec2<f32>(0.04, 0.09);
const SEEN_CAP: f32 = 0.5;
// Ground in full shadow (a crater's shadow near the terminator) keeps its stroke however
// short, so shadows reach into the day as the plain shows them.
const SHADOW_KEEP = vec2<f32>(0.85, 0.98);
// The shade lines turn this far off the plate's hatch, which runs along the terminator:
// crossing it, each line ends where its own ground goes dark, so the edge is the relief's.
const MOON_HATCH_TURN: f32 = 0.7854;

// The shade lines' screen family (phase, along, |d phase / d unit|) at `p` (print units).
fn moonForm(p: vec2<f32>, hatchAngle: f32) -> vec3<f32> {
  let a = hatchAngle + MOON_HATCH_TURN;
  let n = vec2<f32>(-sin(a), cos(a));
  return vec3<f32>(dot(p, n), dot(p, vec2<f32>(n.y, -n.x)), 1.0);
}

fn moonAt(field: texture_2d_array<f32>, layer: i32, ip: vec2<i32>) -> vec4<f32> {
  if (layer < 0) {
    return vec4<f32>(0.0);
  }
  let size = vec2<i32>(textureDimensions(field));
  return decodeMoonRow(textureLoad(field, clamp(ip, vec2<i32>(0), size - 1), layer, 0));
}

fn moonToneAlong(field: texture_2d_array<f32>, layer: i32, ip: vec2<i32>, hatchAngle: f32, unit: f32,
                 ndl: f32, ndv: f32, row: f32, plain: f32) -> MoonTone {
  let here = moonTone(ndl, ndv, row);
  let a = hatchAngle + MOON_HATCH_TURN;
  let o = vec2<i32>(round(vec2<f32>(cos(a), sin(a)) * unit * SHADE_DASH));
  let ahead = moonTone(ndl, ndv, moonAt(field, layer, ip + o).g).tone;
  let behind = moonTone(ndl, ndv, moonAt(field, layer, ip - o).g).tone;
  let cap = mix(MOON_SHADE_CAP, SEEN_CAP, smoothstep(SEEN_LUMA.x, SEEN_LUMA.y, plain));
  let eroded = max(0.5 * (ahead + behind), here.tone * smoothstep(SHADOW_KEEP.x, SHADOW_KEEP.y, here.shade));
  return MoonTone(min(min(here.tone, eroded), cap), here.shade, here.litSlope);
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
// read along the line's own centre row (the mask is the line's, not the pixel's), cut by
// the hysteresis above and the wide albedo's support, ends staggered by the line's hash
// and stepped down over the taps that still read sea.
fn moonMare(field: texture_2d_array<f32>, layer: i32, px: vec2<f32>, unit: f32, moon: MoonTone) -> f32 {
  let pitch = max(round(MOON_PITCH * unit), 3.0);
  let k = floor(px.y / pitch);
  let yc = k * pitch + floor(0.5 * pitch) + 0.5;
  let stagger = 0.008 * (hash21Hq(vec2<f32>(k, 7.7)) - 0.5);
  var taps = array<f32, 5>();
  var darkest = 1.0;
  var wide = 0.0;
  for (var j = 0; j < 5; j++) {
    let s = moonAt(field, layer, vec2<i32>(i32(px.x + f32(j - 2) * MARE_TAP_UNITS * unit), i32(yc)));
    // Off the disc reads as highland, so a sea at the limb still ends in a taper.
    taps[j] = select(0.5, s.r * s.r, s.g > 0.0);
    darkest = min(darkest, taps[j]);
    wide += select(0.7, s.a, s.g > 0.0);
  }
  let shore = select(MARE_ON, MARE_OFF, darkest < MARE_ON + stagger) + stagger;
  var inSea = 0.0;
  for (var j = 0; j < 5; j++) {
    inSea += step(taps[j], shore);
  }
  if (taps[2] > shore || wide * wide / 25.0 > MARE_SUPPORT + stagger) {
    return 0.0;
  }
  // Thinner across the shade's own lines, so a mare at night is a darker weave, not a grid.
  let night = 1.0 - 0.45 * smoothstep(0.45, MOON_SHADE_CAP, moon.tone);
  let dark = smoothstep(MARE_CORE.x, MARE_CORE.y, taps[2]);
  let taper = clamp((inSea - 2.0) / 3.0, 0.0, 1.0);
  let share = mix(MARE_SHARE.x, MARE_SHARE.y, dark) * taper * night * (1.0 - moon.litSlope);
  let weight = round(share / MARE_SHARE.y * MARE_WEIGHTS);
  let w = select(0.0, max(1.0, round(pitch * MARE_SHARE.y * weight / MARE_WEIGHTS)), weight > 0.0);
  // An even weight sits half a px off the row's centre, so it covers whole px too.
  let centre = yc + 0.5 * (1.0 - w % 2.0);
  return step(abs(px.y - centre), 0.5 * w - 0.01);
}

// The plate's Moon arm: the mare lines (cleared inside a bright-floored crater, as the
// pass flags it in b's 2s place: Aristarchus, Copernicus) under the rims, which drop out
// in the deepest shade, where a line in a solid reads as mush.
fn moonInk(field: texture_2d_array<f32>, layer: i32, px: vec2<f32>, unit: f32, moon: MoonTone, b: f32) -> f32 {
  let clear = step(1.5, b);
  let rims = (b - 2.0 * clear) * (1.0 - smoothstep(0.88, 0.98, moon.shade));
  return max(moonMare(field, layer, px, unit, moon) * (1.0 - clear), rims);
}

// The ground's hachures, from the shared relief row (`fsMoonRelief`): down each steep
// slope, a light share where it is lit and up to RELIEF_SHARE.y in shade, by the terrain's
// own light (`shade`), not the plain render's luma: the albedo carries baked shadows from
// another Sun. A rim, steep on both flanks, keeps its crest line (`fallCrest`).
const RELIEF_SHARE = vec2<f32>(0.08, 0.5);

fn moonRelief(field: texture_2d<f32>, samp: sampler, px: vec2<f32>, relief: vec4<f32>, unit: f32,
              shade: f32) -> f32 {
  var ink = fallCrest(field, samp, px, unit);
  if (relief.a > 0.0) {
    let share = min(relief.a * 1.5, 1.0) * mix(RELIEF_SHARE.x, RELIEF_SHARE.y, smoothstep(0.1, 0.5, shade));
    ink = max(ink, quantileCut(fallLines(field, samp, px, unit, false), share));
  }
  return ink;
}
