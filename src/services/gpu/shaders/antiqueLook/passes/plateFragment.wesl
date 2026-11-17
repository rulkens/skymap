// antiqueLook/passes/plateFragment.wesl — the plate: the tone-mapped frame re-cut as an
// engraved, hand-coloured chart on the baked sheet.
//
// Two regimes, split by body coverage (`mask.wesl`). Sky is INVERTED, as on every
// period chart: bare paper where space is empty, a glyph per star, a dot per
// point galaxy, resolved galaxies stippled by their light, and wider faint light —
// Milky Way structure discs, the band seen from inside — as Dutch outline colour: a
// boundary line with a band of wash fading inward, never solid ink. Bodies are
// engraved the classic way: burin lines bowing with the globe, swelling into
// shadow, crossed only in the deepest; what else a body shows is its own
// convention, in its module under `bodies/` (Earth's coasts, Mars's markings).

import package::antiqueLook::shared::captionHalo::captionHalo;
import package::antiqueLook::shared::captionHalo::captionBridge;
import package::antiqueLook::io::AntiqueUniforms;
import package::antiqueLook::io::VSOut;
import package::antiqueLook::shared::paper::vnoise;
import package::antiqueLook::shared::engraving::crossHatch;
import package::antiqueLook::shared::engraving::stipple;
import package::antiqueLook::shared::engraving::stippleDense;
import package::antiqueLook::shared::engraving::formTone;
import package::antiqueLook::shared::engraving::ringLines;
import package::antiqueLook::shared::engraving::seaDistance;
import package::antiqueLook::shared::engraving::landWeight;
import package::antiqueLook::shared::engraving::inkLine;
import package::antiqueLook::shared::plateBodies::PlateBodies;
import package::antiqueLook::shared::plateBodies::BodyHit;
import package::antiqueLook::shared::plateBodies::castPlateBody;
import package::antiqueLook::shared::plateBodies::ballTheta;
import package::antiqueLook::shared::plateBodies::ballLatitude;
import package::antiqueLook::shared::plateBodies::ringRho;
import package::antiqueLook::shared::plateBodies::printOf;
import package::antiqueLook::shared::plateBodies::PRINT_PLAIN;
import package::antiqueLook::shared::plateBodies::PRINT_EARTH;
import package::antiqueLook::shared::plateBodies::PRINT_MARS;
import package::antiqueLook::shared::plateBodies::PRINT_MOON;
import package::antiqueLook::shared::plateBodies::PRINT_JUPITER;
import package::antiqueLook::shared::plateBodies::ballNormal;
import package::antiqueLook::bodies::earth::EarthPrintIn;
import package::antiqueLook::bodies::earth::earthPrint;
import package::antiqueLook::bodies::earth::earthRelief;
import package::antiqueLook::bodies::mars::marsPrint;
import package::antiqueLook::shared::ground::groundRelief;
import package::antiqueLook::bodies::jupiter::JupiterPrintIn;
import package::antiqueLook::bodies::jupiter::jupiterPrint;
import package::antiqueLook::bodies::jupiter::redSpotRadius;
import package::antiqueLook::bodies::moon::MoonTone;
import package::antiqueLook::bodies::moon::moonInk;
import package::antiqueLook::bodies::moon::moonToneAlong;
import package::antiqueLook::bodies::moon::moonShade;
import package::antiqueLook::bodies::moon::moonAt;
import package::antiqueLook::bodies::moon::moonForm;
import package::antiqueLook::bodies::moon::moonRelief;
import package::antiqueLook::shared::graticule::graticule;
import package::antiqueLook::shared::graticule::frameLonLat;
import package::antiqueLook::shared::graticule::globeNormal;
import package::antiqueLook::shared::graticule::skyCircles;
import package::antiqueLook::shared::graticule::handCell;
import package::antiqueLook::shared::pigments::luma;
import package::antiqueLook::shared::pigments::regionPigment;
import package::antiqueLook::shared::pigments::chromaOf;
import package::antiqueLook::shared::pigments::applyWash;
import package::antiqueLook::shared::pigments::pigmentAt;

@group(0) @binding(0) var printTex: texture_2d<f32>;
@group(0) @binding(1) var overlayTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: AntiqueUniforms;
// The rows the look writes itself: one array per size and format, a layer per row
// (ANTIQUE_*_LAYERS, data/rendering/antiqueLook.ts). WebGPU allows a stage 16 sampled
// textures and a phone may offer no more, so a new row is a layer, not a binding.
@group(0) @binding(3) var fullTex: texture_2d_array<f32>;
@group(0) @binding(4) var quarterTex: texture_2d_array<f32>;
@group(0) @binding(5) var lowTex: texture_2d_array<f32>;
// Full res, rgba8: the baked sheet; star ink (`glyphs.wesl`, `web.wesl`); the decor
// (`decor.wesl`: r figure ink, g plate ink, b clear, a wash) and its hue; the Moon's own
// row (`moonRow.wesl`), copied in from its pass; the bodies' mask (`mask.wesl`).
const PAPER_LAYER: i32 = 0;
const STAR_INK_LAYER: i32 = 1;
const DECOR_LAYER: i32 = 2;
const DECOR_HUE_LAYER: i32 = 3;
const MOON_LAYER: i32 = 4;
const MASK_LAYER: i32 = 5;
// The mask's b for a surface nearer than any cast globe (`mask.wesl`): printed plain.
const NEARER_SURFACE: f32 = 0.25;
// Quarter res, rgba16f: the wash; `nebula.wesl`'s x, the band's light; `landBlur.wesl`'s
// x Σ weight·land share, y Σ weight.
const WASH_LAYER: i32 = 0;
const NEBULA_LAYER: i32 = 1;
const LAND_BLUR_LAYER: i32 = 2;
// 1/16 res, rgba16f: the glow; the structure markers' low band (`structureGlow.wesl`:
// premultiplied rgb, a coverage); the web's level (`web.wesl` `fsLevel`: r level, g charted).
const GLOW_LAYER: i32 = 0;
const STRUCTURE_GLOW_LAYER: i32 = 1;
const WEB_LEVEL_LAYER: i32 = 2;
@group(0) @binding(6) var linear: sampler;
@group(0) @binding(7) var<uniform> lettering: AntiqueLettering;
@group(0) @binding(8) var glyphTex: texture_2d<f32>;
// The constellation figures, moved off the HDR roster (ANTIQUE_MOVED_PASSES).
@group(0) @binding(9) var linesTex: texture_2d<f32>;
@group(0) @binding(10) var<uniform> plate: PlateBodies;
// This frame's field floor: the glow's 30th-percentile luma (`skyFloor.wesl`).
@group(0) @binding(11) var<storage, read> skyFloor: f32;
// Earth's c.1690 geography (`earth/antiqueMap/*.wesl`): r realm code, g border band, b line ink, a signs.
@group(0) @binding(12) var geographyTex: texture_2d<f32>;
// The engraved ground (`relief.wesl`): a 0 off it, and wherever the pass did not run.
@group(0) @binding(13) var reliefTex: texture_2d<f32>;

// The border's numbering, placed per frame by `placeAntiqueNumerals`.
struct Glyph {
  centre: vec2<f32>,
  half: vec2<f32>,
  rect: vec4<f32>,
}

struct AntiqueLettering {
  count: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
  items: array<Glyph, 96>,
}

// Warm carbon-black copperplate ink, as a transmittance: it multiplies the sheet.
const INK: vec3<f32> = vec3<f32>(0.17, 0.13, 0.10);
const FLAG_CAPTIONS: u32 = 2u;
// The relief row holds engraved ground this frame (`relief.wesl`), its body's PRINT_*
// code in the flags from this bit: inside the relief shell the globe has no record.
const FLAG_RELIEF: u32 = 16u;
const RELIEF_PRINT_SHIFT: u32 = 8u;
// The Moon's own row holds this frame's Moon (`MOON_LAYER`).
const FLAG_MOON: u32 = 32u;
const MOON_HALO_GROW: f32 = 1.5;
// Over a galaxy's stipple a caption's knock-out is wider, or its dots crowd the letters.
const GALAXY_HALO_GROW: f32 = 1.7;
// Sheet layout in print units: bare margin with the plate mark in it, then the
// neatline band. Mirrored by ANTIQUE_LADDER_UNITS (data/rendering/antiqueLook.ts).
const PLATE: f32 = 15.0;
const MARGIN: f32 = 30.0;
const BAND: f32 = 7.0;
// A side number runs inward up to this far from the sheet's edge: ANTIQUE_SIDE_NUMERAL_REACH_UNITS.
const NUMERAL_SIDE_REACH: f32 = 100.0;
// The debug panel's row switches (`uniforms.hidden`): bit i is ANTIQUE_PLATE_ROWS[i].
const HIDE_RULINGS: u32 = 1u;
const HIDE_LINES: u32 = 2u;
const HIDE_FIGURES: u32 = 4u;
const HIDE_GLYPHS: u32 = 8u;
const HIDE_WEB: u32 = 16u;
const HIDE_GALAXIES: u32 = 32u;
const HIDE_HATCHING: u32 = 64u;
const HIDE_RELIEF: u32 = 128u;
const HIDE_GEOGRAPHY: u32 = 256u;
// A trail's stroke (alpha past TRAIL_ALPHA: a figure's line tops out at LINE_ALPHA)
// is eroded by this many device px each side, leaving a hairline core.
const TRAIL_ALPHA: f32 = 0.9;
const TRAIL_ERODE_PX: f32 = 1.5;
// A constellation line's alpha at full cover: its BASE_ALPHA (constellations/fragment.wesl).
const LINE_ALPHA: f32 = 0.5;
// Glow levels: the outline-colour boundary, and one inner contour.
const GLOW_EDGE: f32 = 0.13;
const GLOW_CORE: f32 = 0.4;
// The same two levels on the structure markers' coverage (their halos' alpha).
const STRUCTURE_EDGE: f32 = 0.05;
const STRUCTURE_CORE: f32 = 0.18;
// The galaxy engraving, in the print's luma: where its stipple starts; the print
// luma its tone's log scale starts from, and that scale's power (over 1 the arms
// and inner disc stay steps under the bar); the tone an inter-arm gap keeps; the
// most a 1/16 surroundings counts for its relief (the bar's glare lifts it, which
// left the bright disc round the bar paper); the densest tone short of the bar; the
// print luma over which the bar rises from it to solid (the print's highlight shoulder,
// ANTIQUE_PRINT_SHOULDER, keeps a gradient there); the dust lanes' hatch spacing in print units.
const GALAXY_EDGE: f32 = 0.10;
const GALAXY_FLOOR: f32 = 0.07;
const GALAXY_SB_POW: f32 = 1.5;
const GALAXY_GAP: f32 = 0.08;
const GALAXY_RELIEF_CAP: f32 = 0.65;
const GALAXY_DISC_MAX: f32 = 0.55;
const GALAXY_BAR_LO: f32 = 0.80;
const GALAXY_BAR_HI: f32 = 0.88;
const LANE_HATCH: f32 = 2.6;
const GALAXY_WASH: f32 = 0.15;

fn texel(tex: texture_2d<f32>, texelPos: vec2<i32>) -> vec4<f32> {
  let size = vec2<i32>(textureDimensions(tex));
  return textureLoad(tex, clamp(texelPos, vec2<i32>(0), size - 1), 0);
}

fn layerTexel(tex: texture_2d_array<f32>, layer: i32, texelPos: vec2<i32>) -> vec4<f32> {
  let size = vec2<i32>(textureDimensions(tex));
  return textureLoad(tex, clamp(texelPos, vec2<i32>(0), size - 1), layer, 0);
}

fn rowOn(bit: u32) -> f32 {
  return select(1.0, 0.0, (uniforms.hidden & bit) != 0u);
}

fn bodyCover(texelPos: vec2<i32>) -> f32 {
  return layerTexel(fullTex, MASK_LAYER, texelPos).r;
}

fn nearerSurface(texelPos: vec2<i32>) -> bool {
  return abs(layerTexel(fullTex, MASK_LAYER, texelPos).b - NEARER_SURFACE) < 0.1;
}

// A body's land share at `uv`: bilinear over the quarter-res cells that carry one
// (`landWeight`). A plain bilinear tap mixed the sky's −1 into a land share at the
// limb and cut a false coast round it. No mapped cell near reads as land.
fn landAt(uv: vec2<f32>) -> f32 {
  let cellPos = uv * vec2<f32>(textureDimensions(quarterTex)) - 0.5;
  let base = vec2<i32>(floor(cellPos));
  let blend = fract(cellPos);
  var sum = 0.0;
  var weight = 0.0;
  for (var tapIndex = 0; tapIndex < 4; tapIndex++) {
    let tapOffset = vec2<i32>(tapIndex & 1, tapIndex >> 1u);
    let washAlpha = layerTexel(quarterTex, WASH_LAYER, base + tapOffset).a;
    let tapWeight = mix(1.0 - blend.x, blend.x, f32(tapOffset.x)) * mix(1.0 - blend.y, blend.y, f32(tapOffset.y)) * landWeight(washAlpha);
    sum += tapWeight * washAlpha;
    weight += tapWeight;
  }
  return select(1.0, sum / weight, weight > 1e-4);
}

// A 1/16-res low band smoothed over nine bilinear taps: contours drawn on it
// must be curves, not the stair-steps of its texels.
fn lowBandAt(layer: i32, uv: vec2<f32>) -> vec4<f32> {
  let texelSize = 1.0 / vec2<f32>(textureDimensions(lowTex));
  var sum = textureSampleLevel(lowTex, linear, uv, layer, 0.0) * 4.0;
  for (var tapIndex = 0; tapIndex < 8; tapIndex++) {
    let angle = f32(tapIndex) * 0.7853982;
    let tapWeight = select(1.0, 2.0, (tapIndex & 1) == 0);
    sum += textureSampleLevel(lowTex, linear, uv + vec2<f32>(cos(angle), sin(angle)) * texelSize * 2.0, layer, 0.0) * tapWeight;
  }
  return sum / 16.0;
}

// Dutch outline colour's band, from a field's signed px inside its boundary: it
// fades inward from the line, clear pigment with no pooled rim (a dark ragged
// edge read as foxing, not colour).
fn outlineBand(insidePx: f32) -> f32 {
  return step(0.0, insidePx) * (1.0 - smoothstep(0.0, 14.0 * uniforms.unit, insidePx));
}

// The boundary line and one inner contour of a low band, before their dots.
fn outlineLevels(level: f32, perPx: f32, edge: f32, core: f32) -> f32 {
  let lineWidth = 0.9 * uniforms.unit;
  return max(
    1.0 - smoothstep(lineWidth, lineWidth + 1.0, abs(level - edge) / perPx),
    0.8 * (1.0 - smoothstep(lineWidth, lineWidth + 1.0, abs(level - core) / perPx)),
  );
}

// The wash's hue at the band's scale, 1.5 quarter-res cells round.
fn washHue(uv: vec2<f32>) -> vec3<f32> {
  let texelSize = 1.5 / vec2<f32>(textureDimensions(quarterTex));
  var sum = textureSampleLevel(quarterTex, linear, uv, WASH_LAYER, 0.0).rgb * 4.0;
  for (var tapIndex = 0; tapIndex < 8; tapIndex++) {
    let angle = f32(tapIndex) * 0.7853982;
    let tapWeight = select(1.0, 2.0, (tapIndex & 1) == 0);
    sum += textureSampleLevel(quarterTex, linear, uv + vec2<f32>(cos(angle), sin(angle)) * texelSize, WASH_LAYER, 0.0).rgb * tapWeight;
  }
  return sum / 16.0;
}

// A resolved galaxy's stipple tone from its `light`, the 1/16 surroundings `lowL` and
// the print's own pixel `nucleus`: surface brightness on a log scale, times the light's
// relief over its surroundings, so an inter-arm gap keeps GALAXY_GAP of it. Only the
// print's highlights (the bar, unblurred, so it keeps its shape) climb past GALAXY_DISC_MAX.
fn galaxyTone(light: f32, lowL: f32, nucleus: f32) -> f32 {
  let surfaceBrightness = pow(clamp(log(max(light, 1e-3) / GALAXY_FLOOR) / -log(GALAXY_FLOOR), 0.0, 1.0), GALAXY_SB_POW);
  let relief = smoothstep(-0.2, 0.35, log((light + 0.02) / (min(lowL, GALAXY_RELIEF_CAP) + 0.02)));
  let bar = mix(GALAXY_DISC_MAX, 1.0, smoothstep(GALAXY_BAR_LO, GALAXY_BAR_HI, nucleus)) * step(GALAXY_BAR_LO, nucleus);
  return max(min(surfaceBrightness * mix(GALAXY_GAP, 1.0, relief), GALAXY_DISC_MAX), bar);
}

// A galaxy stippled as an engraver dotted a nebula: dots denser with its surface
// brightness up to a near-solid bar, its dust lanes in fine hatching. Derivative-free,
// so it runs in the caller's branch. x ink, y wash amount, z warmth (0 smalt, 1 gamboge).
fn galaxyEngraving(texelPos: vec2<i32>, uv: vec2<f32>, src: vec3<f32>, neb: vec4<f32>, lowL: f32,
                   big: f32) -> vec3<f32> {
  let printPos = vec2<f32>(texelPos) / uniforms.unit;
  let pxUnits = 1.0 / uniforms.unit;
  let lxs = neb.x;
  var sum = src;
  for (var tapIndex = 0; tapIndex < 4; tapIndex++) {
    let tapOffset = select(vec2<i32>(1, 0), vec2<i32>(0, 1), tapIndex >= 2) * select(-1, 1, (tapIndex & 1) == 1);
    sum += texel(printTex, texelPos + tapOffset * i32(round(uniforms.unit))).rgb;
  }
  let hue = washHue(uv);
  let mean = luma(sum / 5.0);
  // The band's light, sharpened by the print's own round this pixel, so an arm keeps its edge.
  let light = mix(lxs, mean, 0.5);
  let tone = galaxyTone(light, lowL, mean);
  // Dust: a hole well under its surroundings where those are bright (the inner disc),
  // not an outer inter-arm gap, which stays paper.
  let lane = smoothstep(-0.2, -0.6, log((light + 0.02) / (lowL + 0.02))) * smoothstep(0.3, 0.45, lowL);
  let hatchCoord = dot(printPos, vec2<f32>(cos(uniforms.hatchAngle + 0.5236), sin(uniforms.hatchAngle + 0.5236))) / LANE_HATCH;
  // Whole lines that thin toward a lane's edge, never a grey ramp of sub-pixel ones.
  let hatch = inkLine(abs(fract(hatchCoord) - 0.5) * LANE_HATCH, mix(0.4, 1.0, lane), pxUnits) * smoothstep(0.2, 0.45, lane);
  // A cell under ~2.6 device px aliases the dots into a maze.
  let dots = stippleDense(printPos, max(1.6, 2.6 * pxUnits), tone, pxUnits);
  let ink = max(dots * (1.0 - lane), 0.85 * hatch) * big;
  let chroma = max(hue.r, max(hue.g, hue.b)) - min(hue.r, min(hue.g, hue.b));
  let wash = GALAXY_WASH * smoothstep(GALAXY_EDGE, GALAXY_EDGE + 0.1, lxs) * smoothstep(0.03, 0.10, chroma) * big;
  return vec3<f32>(ink, wash, smoothstep(-0.04, 0.06, hue.r - hue.b));
}

// The colour a whole glow is washed in, judged over ~5 of its texels, so one
// region takes one hue rather than a patchwork.
fn glowHue(uv: vec2<f32>) -> vec3<f32> {
  let texelSize = 1.0 / vec2<f32>(textureDimensions(lowTex));
  var sum = vec3<f32>(0.0);
  for (var tapIndex = 0; tapIndex < 8; tapIndex++) {
    let angle = f32(tapIndex) * 0.7853982;
    sum += textureSampleLevel(lowTex, linear, uv + vec2<f32>(cos(angle), sin(angle)) * texelSize * 4.0, GLOW_LAYER, 0.0).rgb;
  }
  return sum / 8.0;
}

fn viewRay(uv: vec2<f32>) -> vec3<f32> {
  let top = mix(uniforms.rayTL.xyz, uniforms.rayTR.xyz, uv.x);
  let bottom = mix(uniforms.rayBL.xyz, uniforms.rayBR.xyz, uv.x);
  return normalize(mix(top, bottom, uv.y));
}

// Ink of the border digits. Four taps per pixel: the glyphs are set at 64 px
// and drawn at 7–15, so a single bilinear tap would alias their hairlines.
fn numeralInk(devicePx: vec2<f32>) -> f32 {
  var ink = 0.0;
  for (var glyphIndex = 0u; glyphIndex < lettering.count; glyphIndex++) {
    let half = lettering.items[glyphIndex].half;
    let local = (devicePx - lettering.items[glyphIndex].centre) / half;
    if (abs(local.x) > 1.0 || abs(local.y) > 1.0) {
      continue;
    }
    let rect = lettering.items[glyphIndex].rect;
    let texel = (rect.zw - rect.xy) / (2.0 * half);
    let glyphUv = mix(rect.xy, rect.zw, local * 0.5 + 0.5);
    var sum = 0.0;
    for (var tapIndex = 0; tapIndex < 4; tapIndex++) {
      let tapOffset = vec2<f32>(f32(tapIndex & 1), f32(tapIndex >> 1u)) - 0.5;
      sum += textureSampleLevel(glyphTex, linear, glyphUv + tapOffset * texel * 0.5, 0.0).r;
    }
    ink = max(ink, sum * 0.25);
  }
  return ink;
}

// A body's light at the terminator's scale — nine quarter-res taps ~6 cells
// apart, body cells only (wash.a >= 0) — so albedo (dark forest, bright desert,
// a sea glint) never reads as shade, and a thin ring is not darkened by the sky.
fn bodyLight(uv: vec2<f32>) -> f32 {
  let texelSize = 6.0 / vec2<f32>(textureDimensions(quarterTex));
  let centre = textureSampleLevel(quarterTex, linear, uv, WASH_LAYER, 0.0).rgb;
  var light = max(centre.r, max(centre.g, centre.b)) * 2.0;
  var weight = 2.0;
  for (var tapIndex = 0; tapIndex < 8; tapIndex++) {
    let angle = f32(tapIndex) * 0.7853982;
    let tapTexel = textureSampleLevel(quarterTex, linear, uv + vec2<f32>(cos(angle), sin(angle)) * texelSize, WASH_LAYER, 0.0);
    let bodyWeight = step(0.0, tapTexel.a);
    light += max(tapTexel.r, max(tapTexel.g, tapTexel.b)) * bodyWeight;
    weight += bodyWeight;
  }
  return light / weight;
}

// The nearest recorded body along the ray.
fn castPlateBodies(ray: vec3<f32>) -> BodyHit {
  var best = BodyHit(1e30, 0.0, 0.0, 0.0, 0.0, false, 0.0, false, 1e30, 0u);
  for (var bodyIndex = 0u; bodyIndex < min(plate.count, 4u); bodyIndex++) {
    var hit = castPlateBody(ray, plate.items[bodyIndex]);
    if (hit.t < best.t) {
      hit.index = bodyIndex;
      best = hit;
    }
  }
  return best;
}

// Neatline: heavy outer rule, hairline inner rule, and between them the degree
// ladder in the cells of the ruling frame under it (a globe's where the band
// lies over one, else the sky's), so its chequer registers with the rulings and
// the numbers (`placeAntiqueNumerals` picks the same way). x: ink, y: inside the plate.
fn neatline(devicePx: vec2<f32>, uv: vec2<f32>) -> vec2<f32> {
  let printPos = devicePx / uniforms.unit;
  let size = uniforms.res / uniforms.unit;
  let inset = min(min(printPos.x, size.x - printPos.x), min(printPos.y, size.y - printPos.y)) - MARGIN;
  let outer = 1.0 - smoothstep(0.0, 0.5, abs(inset + 1.0) - 1.0);
  let inner = 1.0 - smoothstep(0.0, 0.4, abs(inset - BAND) - 0.3);
  let horizontalEdge = min(printPos.y, size.y - printPos.y) < min(printPos.x, size.x - printPos.x);
  // Read the coordinate on the band's centre line, not at this pixel, so each
  // chequer cell is square to the edge instead of cut along the iso-line.
  var ladder = 0.0;
  // Only the band itself needs the coordinate (two inverse trig calls a pixel).
  if (inset > 1.6 && inset < BAND - 0.6) {
    let mid = MARGIN + BAND * 0.5;
    let alongY = select(size.y - mid, mid, printPos.y < size.y * 0.5) / size.y;
    let alongX = select(size.x - mid, mid, printPos.x < size.x * 0.5) / size.x;
    let onLine = select(vec2<f32>(alongX, uv.y), vec2<f32>(uv.x, alongY), horizontalEdge);
    let ray = viewRay(onLine);
    let globeHit = globeNormal(uniforms.globe, ray);
    let onGlobe = uniforms.globe.steps.x > 0.0 && globeHit.w > 0.0;
    let lonLat = select(frameLonLat(uniforms.sky, ray), frameLonLat(uniforms.globe, globeHit.xyz), onGlobe);
    let steps = select(uniforms.sky.steps, uniforms.globe.steps, onGlobe);
    let coord = select(lonLat.y, lonLat.x, horizontalEdge);
    let cell = select(steps.w, steps.z, horizontalEdge);
    // A Moon plate's border keeps its rules but drops the chart's graduation (`uniforms.subject`).
    ladder = handCell(coord, cell) * (1.0 - uniforms.subject);
  }
  return vec2<f32>(max(max(outer, inner), ladder), smoothstep(BAND, BAND + 0.6, inset));
}

// The plate mark: the copper plate's bevelled edge pressed into the sheet, a
// rounded rectangle lit from the top left; inside it, plate tone.
fn plateMark(devicePx: vec2<f32>) -> f32 {
  let printPos = devicePx / uniforms.unit;
  let size = uniforms.res / uniforms.unit;
  // A plate's corners were filed only slightly round: more reads as a UI card.
  let radius = 2.0;
  let half = size * 0.5 - vec2<f32>(PLATE + radius);
  let cornerDist = abs(printPos - size * 0.5) - half;
  let edgeDist = -(length(max(cornerDist, vec2<f32>(0.0))) + min(max(cornerDist.x, cornerDist.y), 0.0) - radius);
  // Embossed, not printed: a light ridge beside a dark one, swapped on the sides
  // facing away from the light; inside, only a whisper of plate tone.
  let toLight = sign(dot(normalize(printPos - size * 0.5), vec2<f32>(-0.6, -0.8)));
  let ridge = exp(-pow((edgeDist + 0.6) / 0.55, 2.0)) - exp(-pow((edgeDist - 0.6) / 0.55, 2.0));
  return ridge * toLight * 0.11 - smoothstep(0.0, 2.0, edgeDist) * 0.012;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let devicePx = in.pos.xy;
  let texelPos = vec2<i32>(devicePx);
  let printPos = devicePx / uniforms.unit;
  let uv = in.uv;

  let sheet = layerTexel(fullTex, PAPER_LAYER, texelPos);
  let src = texel(printTex, texelPos).rgb;
  let body = bodyCover(texelPos);
  let sky = 1.0 - body;
  let frame = neatline(devicePx, uv);
  let paperTone = sheet.rgb * uniforms.tint * (1.0 + plateMark(devicePx));
  var col = paperTone;

  // Dutch outline colour on the low band: a band 20 units wide inside each
  // glow's boundary, fading inward to plain paper, offset from the engraved
  // line by a slow misregistration field as a colourist's brush was.
  let slip = (vec2<f32>(vnoise(printPos * 0.018 + 3.0), vnoise(printPos * 0.018 + 9.0)) - 0.5) * 0.006;
  let glow = lowBandAt(GLOW_LAYER, uv);
  let lowL = luma(glow.rgb);
  // The colour band reads the same field a little displaced: the brush's slip,
  // approximated to first order from the field's own gradient.
  let glowL = lowL + dot(vec2<f32>(dpdx(lowL), dpdy(lowL)), slip * uniforms.res);
  let lowPerPx = max(fwidth(lowL), 1e-5);
  let inside = (glowL - GLOW_EDGE) / lowPerPx;
  // A galaxy is engraved only where it is big enough to light the 1/16 glow
  // over this frame's field floor (a star's halo is not a nebula; a dense
  // survey field is not one). Elsewhere the outline colour below still holds.
  let floorL = skyFloor;
  let big = smoothstep(1.8 * floorL + 0.03, 2.6 * floorL + 0.05, lowL);
  let neb = textureSampleLevel(quarterTex, linear, uv, NEBULA_LAYER, 0.0);
  var galaxy = vec3<f32>(0.0);
  if (sky > 0.0 && neb.x > 0.8 * GALAXY_EDGE) {
    galaxy = galaxyEngraving(texelPos, uv, src, neb, lowL, big);
  }
  galaxy *= rowOn(HIDE_GALAXIES);
  let band = outlineBand(inside) * sky * (1.0 - big);
  // A Milky Way structure's disc (a nebula, a cluster) is outlined from its own row, never engraved.
  let structure = lowBandAt(STRUCTURE_GLOW_LAYER, uv);
  let structL = structure.a;
  let structPerPx = max(fwidth(structL), 1e-5);
  let structSlipL = structL + dot(vec2<f32>(dpdx(structL), dpdy(structL)), slip * uniforms.res);
  let structBand = outlineBand((structSlipL - STRUCTURE_EDGE) / structPerPx) * sky;
  // The hue is only needed where the band paints.
  var hue = vec3<f32>(0.0);
  if (band > 0.0) {
    hue = glowHue(uv);
  }
  // Colour gathers on the subject at the plate's centre and thins toward its
  // edges (to ~30%), so the eye lands on the subject, not the margins.
  let focus = uniforms.tune.y * (1.0 - 0.7 * smoothstep(0.18, 0.62, length((uv - 0.5) * vec2<f32>(uniforms.res.x / uniforms.res.y, 1.0)) * 0.9));
  // Only a glow with a hue of its own is coloured; a grey one keeps just its line
  // (a grey glow washed in ochre read as scorched paper).
  let skyWash = band * 0.35 * focus * smoothstep(0.03, 0.12, chromaOf(hue));
  col = applyWash(col, regionPigment(hue), skyWash * sky * frame.y);
  let structHue = structure.rgb / max(structure.a, 1e-3);
  let structWash = structBand * 0.35 * focus * smoothstep(0.03, 0.12, chromaOf(structHue));
  col = applyWash(col, regionPigment(structHue), structWash * frame.y);
  let galaxyWash = galaxy.y * focus * sky * frame.y;
  col = applyWash(col, pigmentAt(5.0), galaxyWash * (1.0 - galaxy.z)); // smalt
  col = applyWash(col, pigmentAt(2.0), galaxyWash * galaxy.z); // gamboge

  // On a Moon plate the chart's figures, rulings and numerals fade (`uniforms.subject`); star-to-star lines stay.
  let chart = 1.0 - uniforms.subject;
  let figures = rowOn(HIDE_FIGURES) * chart;
  let decorTexel = layerTexel(fullTex, DECOR_LAYER, texelPos);
  // A figure's wash fades with it; a clearing ornament's (the cartouche's) stays.
  let ornament = decorTexel * vec4<f32>(figures, 1.0, 1.0, max(figures, step(0.01, decorTexel.b)));
  col = mix(col, paperTone, ornament.b);
  // Figures lie on the sky, behind any body; only a clearing ornament covers one.
  let behind = max(sky, ornament.b);
  // Hand-laid washes, only where one is: the ornaments' (pooling and thinning
  // across a figure, never one flat tint) and the border's gamboge between the
  // neatline's rules, its edges wandering as a brush along a ruler does.
  let edgeUnits = min(min(printPos.x, uniforms.res.x / uniforms.unit - printPos.x), min(printPos.y, uniforms.res.y / uniforms.unit - printPos.y)) - MARGIN;
  if (ornament.a > 0.0 || edgeUnits < BAND + 3.5) {
    let pooling = 0.7 + 0.6 * vnoise(printPos * 0.035 + 17.0);
    col = applyWash(col, max(layerTexel(fullTex, DECOR_HUE_LAYER, texelPos).rgb, vec3<f32>(1e-3)), ornament.a * 0.55 * pooling * behind * frame.y);
    let wander = edgeUnits + (vnoise(printPos * 0.07) - 0.5) * 2.4;
    let border = smoothstep(-4.0, -3.0, wander) * (1.0 - smoothstep(BAND + 1.0, BAND + 2.0, wander));
    col = applyWash(col, pigmentAt(2.0), border * uniforms.borderWash * pooling);
  }

  // Sky: glyphs for stars, the galaxy engraving, and on wider faint light the
  // boundary line and one inner contour of the low band. Star glyphs were scattered by glyphs.wesl: x ink, y paper knock-out.
  let glyphs = rowOn(HIDE_GLYPHS);
  let web = rowOn(HIDE_WEB);
  let star = layerTexel(fullTex, STAR_INK_LAYER, texelPos) * vec4<f32>(glyphs, glyphs, web, 0.0);
  let webLevel = textureSampleLevel(lowTex, linear, uv, WEB_LEVEL_LAYER, 0.0).rg;
  let voidLift = (1.0 - smoothstep(-1.0, 0.6, webLevel.x)) * webLevel.y * web;
  let clear = 1.0 - star.y;
  // A glow's edge is dotted, as Bayer and de Wit drew a nebula's: a solid
  // ragged line here would read as a coast.
  let onEdge = max(
    outlineLevels(lowL, lowPerPx, GLOW_EDGE, GLOW_CORE) * (1.0 - big),
    outlineLevels(structL, structPerPx, STRUCTURE_EDGE, STRUCTURE_CORE),
  );
  var contour = 0.0;
  if (onEdge > 0.0) {
    contour = onEdge * stipple(printPos, 2.3, 0.4);
  }
  // The web chart (`web.wesl`): z its ink; its voids lift a field galaxy, never an
  // engraved (big) one, which is a subject.
  let skyInk = max(star.x, max(max(galaxy.x * max(1.0 - voidLift, big), star.z), contour) * clear) * sky;
  // The rulings were cut by hand too: their ink load wanders along their length.
  let ray = viewRay(uv);
  let skyRulings = max(graticule(frameLonLat(uniforms.sky, ray), uniforms.sky.steps, uniforms.unit), skyCircles(ray, uniforms.sky, uniforms.unit));
  // A globe's net, on its own pixels: clear of its town signs and molehills (their paper, as
  // `bodies/earth.wesl` reads it), crossing its borders and rivers as the maps' did.
  var globeRulings = 0.0;
  let nearer = nearerSurface(texelPos);
  if (uniforms.globe.lon90.w > 0.0) {
    let globeHit = globeNormal(uniforms.globe, ray);
    let signs = clamp(2.0 * texel(geographyTex, texelPos).a, 0.0, 1.0);
    // Not over a nearer surface; its derivatives want uniform flow, so masked, not branched.
    globeRulings = graticule(frameLonLat(uniforms.globe, globeHit.xyz), uniforms.globe.steps, uniforms.unit) * globeHit.w * uniforms.globe.lon90.w * (1.0 - signs) * f32(!nearer);
  }
  let rulings = (skyRulings * sky * clear * chart + globeRulings * body) * (0.7 + 0.45 * vnoise(printPos * 0.045)) * rowOn(HIDE_RULINGS);
  // Constellation figures and orbits as a fine rule under the rulings' weight
  // (`uniforms.tune.w`, 0.45 by default, against the rulings' 0.56–0.92).
  // Ink follows a thin line's coverage, so a slanted one stays whole: a
  // threshold on it cut machine-regular dashes. An orbit's trail lands as a
  // solid stroke (additive, alpha 1 across 5 px): only its eroded core inks.
  let lineAlpha = texel(linesTex, texelPos).a;
  var lineCover = clamp(lineAlpha / LINE_ALPHA, 0.0, 1.0);
  if (lineAlpha > TRAIL_ALPHA) {
    let erodeUv = TRAIL_ERODE_PX / uniforms.res;
    lineCover = min(
      min(textureSampleLevel(linesTex, linear, uv + vec2<f32>(erodeUv.x, 0.0), 0.0).a,
        textureSampleLevel(linesTex, linear, uv - vec2<f32>(erodeUv.x, 0.0), 0.0).a),
      min(textureSampleLevel(linesTex, linear, uv + vec2<f32>(0.0, erodeUv.y), 0.0).a,
        textureSampleLevel(linesTex, linear, uv - vec2<f32>(0.0, erodeUv.y), 0.0).a));
    lineCover = smoothstep(0.2, 0.9, lineCover);
  }
  let lines = lineCover * (0.75 + 0.4 * vnoise(printPos * 0.06 + 5.0)) * sky * clear * uniforms.tune.w * rowOn(HIDE_LINES);

  // Bodies: burin hatching for the shade, and each recorded body's own
  // convention from its module (`printOf`). A recorded body (`plate`) is cast
  // analytically, so its lines bow with the globe and its tone is read off the
  // form; any other body keeps straight lines on the light at the terminator's
  // scale. Derivatives are taken here, in uniform control flow; the rest of
  // the body work runs only where a body is.
  let landShare = landAt(uv);
  let landPerPx = max(fwidth(landShare), 1e-4);
  let landBlur = textureSampleLevel(quarterTex, linear, uv, LAND_BLUR_LAYER, 0.0).xy;
  let blurredShare = select(1.0, landBlur.x / landBlur.y, landBlur.y > 1e-3);
  let seaD = seaDistance(blurredShare);
  let seaPerUnit = length(vec2<f32>(dpdx(seaD), dpdy(seaD))) * uniforms.unit;
  let limb = layerTexel(fullTex, MASK_LAYER, texelPos).a;
  var bodyInk = 0.0;
  if (body > 0.0) {
    let pxUnits = 1.0 / uniforms.unit;
    let hatchNormal = vec2<f32>(-sin(uniforms.hatchAngle), cos(uniforms.hatchAngle));
    let along = dot(printPos, vec2<f32>(hatchNormal.y, -hatchNormal.x));
    // A nearer surface (a spacecraft over Earth) is no cast globe: the plain path.
    var hit = BodyHit(1e30, 0.0, 0.0, 0.0, 0.0, false, 0.0, false, 1e30, 0u);
    if (!nearer) {
      hit = castPlateBodies(viewRay(uv));
    }
    var tone = 0.0;
    var form = vec3<f32>(dot(printPos, hatchNormal), along, 1.0);
    var lines = 0.0;
    var print = PRINT_PLAIN;
    var latForm = form;
    var latRadius = 1.0; // the globe's apparent radius under `latForm`, print units
    var spotQ = 1e3;
    var spotQPerUnit = 1.0;
    var jupiterShade = 0.0;
    var jupiterBands = vec3<f32>(0.0, 1.0, 0.0); // xy across the bands (screen, unit), z disc px
    var moon = MoonTone(0.0, 0.0, 0.0, 0.0);
    let moonLayer = select(-1, MOON_LAYER, (uniforms.flags & FLAG_MOON) != 0u);
    var moonTexel = vec4<f32>(0.0);
    let relief = texel(reliefTex, texelPos);
    let ground = (uniforms.flags & FLAG_RELIEF) != 0u && relief.a != 0.0 && rowOn(HIDE_RELIEF) > 0.0;
    if (hit.t < 1e30) {
      let plateBody = plate.items[hit.index];
      let radius = plateBody.centre.w;
      // Gradients from two more casts a pixel over: no dpdx inside this branch.
      let rayX = viewRay(uv + vec2<f32>(1.0 / uniforms.res.x, 0.0));
      let rayY = viewRay(uv + vec2<f32>(0.0, 1.0 / uniforms.res.y));
      if (hit.onRing) {
        // Paper, but for the ball's shadow, hatched ALONG the ring as concentric ellipses.
        let rhoPerUnit = length(vec2<f32>(ringRho(rayX, plateBody), ringRho(rayY, plateBody)) - hit.rho) * uniforms.unit;
        tone = 0.6 * hit.ballShadow;
        form = vec3<f32>(hit.rho * radius, along, rhoPerUnit * radius);
        lines = ringLines(hit.rho, rhoPerUnit, plateBody.ringEdges, printPos, pxUnits);
      } else {
        // Half the screen line, half the Sun's parallel: lines bow with the globe
        // yet still cross the tone's contours, so they taper at both ends. `hatchNormal`
        // points away from the Sun, as the arc grows: the halves add, never cancel.
        print = printOf(plateBody);
        tone = formTone(hit.ndl, hit.ndv);
        if (print == PRINT_MOON) {
          moonTexel = moonAt(fullTex, moonLayer, texelPos);
          moon = moonToneAlong(fullTex, moonLayer, texelPos, uniforms.hatchAngle, uniforms.unit, hit.ndl, hit.ndv, moonTexel.g, luma(src));
          tone = moon.tone;
        }
        // The ring's shadow on the ball is one solid stroke, not hatching.
        if (hit.ringShadow) {
          tone = max(tone, 0.85);
          lines = 0.95;
        }
        if (tone > 0.06) {
          let phase = 0.5 * dot(printPos, hatchNormal) + 0.5 * radius * hit.theta;
          let screenStep = 0.5 * hatchNormal * pxUnits;
          let thetaStepX = screenStep.x + 0.5 * radius * (ballTheta(rayX, plateBody) - hit.theta);
          let thetaStepY = screenStep.y + 0.5 * radius * (ballTheta(rayY, plateBody) - hit.theta);
          form = vec3<f32>(phase, along, length(vec2<f32>(thetaStepX, thetaStepY)) * uniforms.unit);
        }
        if (print == PRINT_MARS || print == PRINT_JUPITER) {
          let lats = vec3<f32>(ballLatitude(viewRay(uv), plateBody), ballLatitude(rayX, plateBody), ballLatitude(rayY, plateBody));
          // Jupiter's bands keep an even spacing on the page: the height along the pole.
          let latHeights = select(lats, sin(lats), print == PRINT_JUPITER);
          latForm = vec3<f32>(radius * latHeights.x, along, length(latHeights.yz - latHeights.x) * radius * uniforms.unit);
          latRadius = radius;
          jupiterBands = vec3<f32>((latHeights.yz - latHeights.x) / max(length(latHeights.yz - latHeights.x), 1e-9), radius * uniforms.unit);
        }
        // Jupiter lays its shade in its bands' own lines (`jupiterPrint`).
        if (print == PRINT_JUPITER) {
          jupiterShade = tone;
          tone = 0.0;
        }
        if (print == PRINT_JUPITER && plateBody.spot.w > 0.0) {
          let bodyCentre = plateBody.centre.xyz;
          spotQ = redSpotRadius(ballNormal(viewRay(uv), bodyCentre), plateBody.ring.xyz, plateBody.spot.xyz);
          let spotQAtX = redSpotRadius(ballNormal(rayX, bodyCentre), plateBody.ring.xyz, plateBody.spot.xyz);
          let spotQAtY = redSpotRadius(ballNormal(rayY, bodyCentre), plateBody.ring.xyz, plateBody.spot.xyz);
          spotQPerUnit = length(vec2<f32>(spotQAtX, spotQAtY) - spotQ) * uniforms.unit;
        }
      }
      lines = max(lines, inkLine(hit.edgeUnits, 1.1, pxUnits));
    } else {
      tone = select(1.0 - smoothstep(0.015, 0.17, bodyLight(uv)), 0.0, ground);
    }
    // The Moon's own row (`fsMoonPrint`): g 0 where it did not run.
    let moonRow = print == PRINT_MOON && moonTexel.g > 0.0;
    var hatch = 0.0;
    if (moonRow) {
      hatch = moonShade(moonForm(printPos, uniforms.hatchAngle), tone, pxUnits);
    } else {
      hatch = crossHatch(form, printPos, tone, uniforms.tune.x, uniforms.hatchAngle, pxUnits);
    }
    bodyInk = max(hatch * rowOn(HIDE_HATCHING), lines);
    // A clearing ornament (the cartouche) keeps its field paper over a globe's washes too.
    let cover = body * frame.y * (1.0 - ornament.b);
    if (print == PRINT_EARTH) {
      let earthIn = EarthPrintIn(printPos, pxUnits, uniforms.unit, tone, landShare, landPerPx,
        landAt(uv + slip * 0.6), blurredShare, seaD, seaPerUnit, texel(geographyTex, texelPos) * rowOn(HIDE_GEOGRAPHY));
      let earth = earthPrint(col, cover, earthIn);
      col = earth.col;
      bodyInk = max(bodyInk, earth.ink);
    } else if (print == PRINT_MARS || (ground && (uniforms.flags >> RELIEF_PRINT_SHIFT) == PRINT_MARS)) {
      let mars = marsPrint(col, cover, landShare, latForm, latRadius, printPos, pxUnits);
      col = mars.col;
      // Its wash carries onto the engraved ground, where the relief, not the marking, inks.
      bodyInk = max(bodyInk, select(mars.ink, 0.0, ground));
    } else if (print == PRINT_JUPITER) {
      let jupiter = jupiterPrint(col, cover, JupiterPrintIn(latForm, uniforms.tune.x, jupiterShade, spotQ, spotQPerUnit,
        printPos, pxUnits, hit.ndv, uv, 1.0 / uniforms.res, jupiterBands.xy, jupiterBands.z), quarterTex, linear, WASH_LAYER);
      col = jupiter.col;
      bodyInk = max(bodyInk, jupiter.ink);
    } else if (moonRow) {
      bodyInk = max(bodyInk, moonInk(fullTex, moonLayer, devicePx, uniforms.unit, moon, moonTexel.b));
    }
    if (ground) {
      let around = luma(textureSampleLevel(quarterTex, linear, uv, WASH_LAYER, 0.0).rgb);
      if ((uniforms.flags >> RELIEF_PRINT_SHIFT) == PRINT_EARTH) {
        bodyInk = max(bodyInk, earthRelief(reliefTex, devicePx, relief, uniforms.unit, luma(src), around));
      } else if ((uniforms.flags >> RELIEF_PRINT_SHIFT) == PRINT_MOON) {
        bodyInk = max(bodyInk, select(0.0, moonRelief(reliefTex, linear, devicePx, relief, uniforms.unit, moon, moonTexel, luma(src), around), moonRow));
      } else {
        bodyInk = max(bodyInk, groundRelief(reliefTex, linear, devicePx, relief, uniforms.unit, quarterTex, WASH_LAYER));
      }
    }
    bodyInk *= body;
  }

  let figure = ornament.r * clear * sky;
  var scene = max(max(max(bodyInk, limb), max(skyInk, max(rulings, lines))), figure) * (1.0 - ornament.b);
  // Captions at full ink, each on its own knock-out of the engraving and wash
  // beneath it, as an engraver lettered over the work. Bare paper has nothing
  // to clear, so it skips the halo's taps.
  var captions = 0.0;
  if ((uniforms.flags & FLAG_CAPTIONS) != 0u) {
    // Ink from the letters' light fill only; their dark contrast outline (drawn
    // for a black sky) feeds the paper halo instead of thickening the type. The
    // fill is white, so luma is its anti-aliased coverage, lifted so a hairline
    // at small sizes still prints black; wear trades that for a hard, bolder
    // threshold that the rag below then frays.
    let overlay = texel(overlayTex, texelPos);
    let worn = smoothstep(0.03, 0.2, overlay.a) * smoothstep(0.3, 0.6, luma(overlay.rgb / max(overlay.a, 1e-3)));
    captions = mix(smoothstep(0.0, 0.7, luma(overlay.rgb)), worn, uniforms.letterWear);
    if (scene > 0.0 || any(col != paperTone)) {
      // A Moon plate's names sit on mare lines as dense as any work: a wider knock-out.
      let overGalaxy = neb.x > 0.8 * GALAXY_EDGE && sky > 0.0;
      let haloUnit = uniforms.unit * select(select(1.0, GALAXY_HALO_GROW, overGalaxy), MOON_HALO_GROW, (uniforms.flags & FLAG_MOON) != 0u);
      let halo = max(captionHalo(overlayTex, texelPos, haloUnit, overlay.a), captionBridge(overlayTex, texelPos, uniforms.unit));
      col = mix(col, paperTone, halo);
      scene *= 1.0 - halo;
    }
  }
  let lettered = max(scene, captions);
  // The border's digits only exist along the edges: skip their loop elsewhere.
  var numerals = 0.0;
  let sideUnits = min(printPos.x, uniforms.res.x / uniforms.unit - printPos.x);
  let rowUnits = min(printPos.y, uniforms.res.y / uniforms.unit - printPos.y);
  if (rowUnits < MARGIN + BAND + 30.0 || sideUnits < NUMERAL_SIDE_REACH) {
    numerals = numeralInk(devicePx) * (1.0 - ornament.b) * chart;
  }
  let content = max(lettered, max(ornament.g, numerals));
  var ink = max(content * frame.y, frame.x);
  // The plate is wiped by hand and printed on laid paper: the ink's edge is
  // ragged by a few tenths of a unit and the sheet's dips take less of it.
  // Lettering takes both only as far as its wear: a frayed small name stops reading.
  let wear = mix(1.0, uniforms.letterWear, min(captions * 2.0, 1.0));
  let rag = (vnoise(printPos * 1.7) - 0.5) * 0.35 * wear;
  let edgeInk = min(ink, 1.0);
  ink = max(ink + rag * edgeInk * (1.0 - edgeInk) * 4.0, 0.0);
  ink *= 1.0 - 0.28 * wear * (1.0 - smoothstep(0.25, 0.65, sheet.a));
  // Ink as density: one full stroke leaves INK's transmittance, a crossing more.
  col *= pow(INK, vec3<f32>(ink * uniforms.tune.z));
  return vec4<f32>(col, 1.0);
}
