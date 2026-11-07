// antiqueLook/bodies/moon.wesl — the Moon as Grimaldi engraved it for Riccioli (1651),
// from its own pass's relief row (`texturedBody/fragment.wesl` `fsMoonPrint`): r the
// albedo, g 1 + the relief ratio (0 = no Moon), b rim ink, a 1 + the wall coordinate.
// The maria are level burin lines thickening with the albedo, the highlands paper; no
// coast, no wash (owner ruling). The ground tone is lunar photometry, so the full disc
// is as flat as the real one, and the shade stops short of its crossing set: on the
// Moon the crossing belongs to the maria, so a night-side mare still reads darker.

import package::antiqueLook::engraving::crossHatch;

// Lommel–Seeliger brightness 2·ndl/(ndl + ndv): ~1 over the whole full disc (no limb
// darkening), falling only toward the terminator. Paper from 0.6.
const LS_GROUND = vec2<f32>(-0.08, 0.6);
// Relief ratio at full shade .. at none; past 1 + RATIO_BRIGHT a sunward slope is paper.
// The shade starts at 0.75, not near 1: a slope barely off the ground's light would
// print its first lines one by one, a rain of loose dashes across the highlands.
const RATIO_DARK = vec2<f32>(0.25, 0.75);
const RATIO_BRIGHT: f32 = 0.6;
// 2.3-unit lines at most (55% ink): the night side leaves room for the maria.
const MOON_SHADE_CAP: f32 = 0.72;
// Linear albedo: the first lines arrive at the shore (~0.245), all 8 by the mare body
// (~0.165); only the darkest cores (Crisium, Tranquillitatis) swell toward 1.6 units.
const MARE_SHORE: f32 = 0.26;
const MARE_BODY: f32 = 0.16;
const MARE_CORE = vec2<f32>(0.105, 0.075);
const MARE_BODY_TONE: f32 = 0.40;
const MARE_CORE_TONE: f32 = 0.13;
// = MARS_HATCH, level across the disc: lines that bow with the globe draw a target.
const MARE_HATCH: f32 = 3.2;
// = WALL_PERIOD in `fsMoonPrint`: eight hatch lines at the default spacing
// (ANTIQUE_TUNING_DEFAULTS.hatchUnits, 4.2); it needn't follow the slider.
const WALL_PERIOD: f32 = 33.6;

// tone: the globe's on the Moon's ladder, a slope darker than its ground pulled toward
// full shade, a sunward one toward paper (Hevelius' lit peaks), capped; shade: the same
// uncapped; litSlope: how far a slope is turned to the Sun.
struct MoonTone {
  tone: f32,
  shade: f32,
  litSlope: f32,
}

fn moonTone(ndl: f32, ndv: f32, relief: f32) -> MoonTone {
  let rim = 1.0 - smoothstep(0.0, 0.5, ndv);
  let brightness = 2.0 * ndl / max(abs(ndl) + max(ndv, 0.02), 1e-4);
  let ground = clamp(1.0 - smoothstep(LS_GROUND.x, LS_GROUND.y, brightness)
                     - 0.5 * rim * smoothstep(0.05, -0.25, ndl), 0.0, 1.0);
  if (ndl < 0.0 || relief <= 0.0) {
    return MoonTone(min(ground, MOON_SHADE_CAP), ground, 0.0);
  }
  let r = relief - 1.0;
  let dark = smoothstep(RATIO_DARK.y, RATIO_DARK.x, r);
  let bright = smoothstep(1.0, 1.0 + RATIO_BRIGHT, r);
  let shade = select(ground * (1.0 - bright), ground + (1.0 - ground) * dark, r < 1.0);
  return MoonTone(min(shade, MOON_SHADE_CAP), shade, bright);
}

// The maria's level lines from r = sqrt(albedo); a lit crater wall inside a mare stays white.
fn moonMare(encoded: f32, litSlope: f32, p: vec2<f32>, pxUnits: f32) -> f32 {
  let albedo = encoded * encoded;
  let tone = MARE_BODY_TONE * smoothstep(MARE_SHORE, MARE_BODY, albedo)
           + MARE_CORE_TONE * smoothstep(MARE_CORE.x, MARE_CORE.y, albedo);
  return crossHatch(vec3<f32>(p.y, p.x, 1.0), p, tone, MARE_HATCH, 0.0, pxUnits) * (1.0 - litSlope);
}

// Inside a big crater's wall band the hatching follows the bowl's contours: concentric
// arcs. a, aX, aY: the wall channel here and a pixel over (the period unwrapped; a
// neighbour outside the band reads the other side's step).
fn moonWallForm(form: vec3<f32>, a: f32, aX: f32, aY: f32, aXm: f32, aYm: f32, unit: f32) -> vec3<f32> {
  if (a <= 0.0) {
    return form;
  }
  let dx = select(a - aXm, aX - a, aX > 0.0);
  let dy = select(a - aYm, aY - a, aY > 0.0);
  let d = (fract(vec2<f32>(dx, dy) / WALL_PERIOD + 0.5) - 0.5) * WALL_PERIOD;
  return vec3<f32>(a - 1.0, form.y, clamp(length(d) * unit, 0.2, 8.0));
}

// Rim ink drops out in the deepest shade, where a line in a solid reads as mush.
fn moonRims(ink: f32, shade: f32) -> f32 {
  return ink * (1.0 - smoothstep(0.88, 0.98, shade));
}
