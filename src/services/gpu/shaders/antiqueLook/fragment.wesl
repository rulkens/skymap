// antiqueLook/fragment.wesl — the plate: the tone-mapped frame re-cut as an
// engraved, hand-coloured chart on the baked sheet.
//
// Two regimes, split by body coverage (`cover.wesl`). Sky is INVERTED, as on every
// period chart: bare paper where space is empty, a glyph per star, galaxies cut
// as swelling iso-lines inside a dotted outline, and wider faint light —
// structure discs, the band seen from inside — as Dutch outline colour: a
// boundary line with a band of wash fading inward, never solid ink. Bodies are
// engraved the classic way: burin lines bowing with the globe, swelling into
// shadow, crossed only in the deepest; what else a body shows is its own
// convention, in its module under `bodies/` (Earth's coasts, Mars's markings).

import package::antiqueLook::captionHalo::captionHalo;
import package::antiqueLook::io::AntiqueUniforms;
import package::antiqueLook::io::VSOut;
import package::antiqueLook::cover::coverOf;
import package::antiqueLook::cover::FLAG_DEPTH_COVER;
import package::antiqueLook::paper::vnoise;
import package::antiqueLook::engraving::crossHatch;
import package::antiqueLook::engraving::stipple;
import package::antiqueLook::engraving::formTone;
import package::antiqueLook::engraving::ringLines;
import package::antiqueLook::engraving::seaDistance;
import package::antiqueLook::engraving::landWeight;
import package::antiqueLook::engraving::inkLine;
import package::antiqueLook::engraving::isoLines;
import package::antiqueLook::plateBodies::PlateBodies;
import package::antiqueLook::plateBodies::BodyHit;
import package::antiqueLook::plateBodies::castPlateBody;
import package::antiqueLook::plateBodies::ballTheta;
import package::antiqueLook::plateBodies::ballLatitude;
import package::antiqueLook::plateBodies::ringRho;
import package::antiqueLook::plateBodies::printOf;
import package::antiqueLook::plateBodies::PRINT_PLAIN;
import package::antiqueLook::plateBodies::PRINT_EARTH;
import package::antiqueLook::plateBodies::PRINT_MARS;
import package::antiqueLook::plateBodies::PRINT_MOON;
import package::antiqueLook::bodies::earth::EarthPrintIn;
import package::antiqueLook::bodies::earth::earthPrint;
import package::antiqueLook::bodies::mars::marsPrint;
import package::antiqueLook::bodies::mars::marsRelief;
import package::antiqueLook::bodies::moon::MoonTone;
import package::antiqueLook::bodies::moon::moonMare;
import package::antiqueLook::bodies::moon::moonRims;
import package::antiqueLook::bodies::moon::moonTone;
import package::antiqueLook::bodies::moon::moonWallForm;
import package::antiqueLook::graticule::graticule;
import package::antiqueLook::graticule::frameLonLat;
import package::antiqueLook::graticule::globeNormal;
import package::antiqueLook::graticule::skyCircles;
import package::antiqueLook::pigments::luma;
import package::antiqueLook::pigments::regionPigment;
import package::antiqueLook::pigments::chromaOf;
import package::antiqueLook::pigments::applyWash;
import package::antiqueLook::pigments::pigmentAt;

@group(0) @binding(0) var printTex: texture_2d<f32>;
@group(0) @binding(1) var overlayTex: texture_2d<f32>;
@group(0) @binding(2) var bodyTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> u: AntiqueUniforms;
// The rows the look writes itself: one array per size and format, a layer per row
// (ANTIQUE_*_LAYERS, data/rendering/antiqueLook.ts). WebGPU allows a stage 16 sampled
// textures and a phone may offer no more, so a new row is a layer, not a binding.
@group(0) @binding(4) var fullTex: texture_2d_array<f32>;
@group(0) @binding(5) var quarterTex: texture_2d_array<f32>;
@group(0) @binding(6) var lowTex: texture_2d_array<f32>;
// Full res, rgba8: the baked sheet; star ink (`glyphs.wesl`, `web.wesl`); the decor
// (`decor.wesl`: r figure ink, g plate ink, b clear, a wash) and its hue.
const PAPER_LAYER: i32 = 0;
const STAR_INK_LAYER: i32 = 1;
const DECOR_LAYER: i32 = 2;
const DECOR_HUE_LAYER: i32 = 3;
// Quarter res, rgba16f: the wash; `nebula.wesl`'s fields (x Lxs, y Lsm, z the iso-line
// input, w the lane reference); `landBlur.wesl`'s x Σ weight·land share, y Σ weight.
const WASH_LAYER: i32 = 0;
const NEBULA_LAYER: i32 = 1;
const LAND_BLUR_LAYER: i32 = 2;
// 1/16 res, rgba16f: the glow; the structure markers' low band (`structureGlow.wesl`:
// premultiplied rgb, a coverage).
const GLOW_LAYER: i32 = 0;
const STRUCTURE_GLOW_LAYER: i32 = 1;
@group(0) @binding(7) var linear: sampler;
@group(0) @binding(8) var<uniform> lettering: AntiqueLettering;
@group(0) @binding(9) var glyphTex: texture_2d<f32>;
// The constellation figures, moved off the HDR roster (ANTIQUE_MOVED_PASSES).
@group(0) @binding(10) var linesTex: texture_2d<f32>;
@group(0) @binding(11) var<uniform> plate: PlateBodies;
// This frame's field floor: the glow's 30th-percentile luma (`skyFloor.wesl`).
@group(0) @binding(12) var<storage, read> skyFloor: f32;
// Earth's c.1690 geography (`earth/antiqueMap/*.wesl`): r realm code, g border band, b line ink, a signs.
@group(0) @binding(13) var geographyTex: texture_2d<f32>;
// The engraved ground (`relief.wesl`): a 0 off it, and wherever the pass did not run.
@group(0) @binding(14) var reliefTex: texture_2d<f32>;

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
const FLAG_BODIES: u32 = 1u;
const FLAG_CAPTIONS: u32 = 2u;
// The relief row holds Mars ground this frame (`relief.wesl`).
const FLAG_RELIEF: u32 = 16u;
// `depthEdge`'s second difference of depth over the nearest tap's depth.
const DEPTH_JUMP: f32 = 0.05;
// Sheet layout in print units: bare margin with the plate mark in it, then the
// neatline band. Mirrored by ANTIQUE_LADDER_UNITS (data/rendering/antiqueLook.ts).
const PLATE: f32 = 15.0;
const MARGIN: f32 = 30.0;
const BAND: f32 = 7.0;
// A side number runs inward up to this far from the sheet's edge: ANTIQUE_SIDE_NUMERAL_REACH_UNITS.
const NUMERAL_SIDE_REACH: f32 = 100.0;
// Hatch spacing on bodies, print units.
const HATCH: f32 = 4.2;
// A constellation line's alpha at full cover: its BASE_ALPHA (constellations/fragment.wesl).
const LINE_ALPHA: f32 = 0.5;
// Glow levels: the outline-colour boundary, and one inner contour.
const GLOW_EDGE: f32 = 0.13;
const GLOW_CORE: f32 = 0.4;
// The same two levels on the structure markers' coverage (their halos' alpha).
const STRUCTURE_EDGE: f32 = 0.05;
const STRUCTURE_CORE: f32 = 0.18;
// The galaxy engraving (RECIPE.md Part 2), levels in the print's luma: the lowest
// outline, where iso-lines take over from stipple (LINE_ON mirrors nebula.wesl),
// the tone ramp and how hard a band's relief over its 1/16 surroundings drives it.
const GALAXY_EDGE: f32 = 0.10;
const LINE_ON: f32 = 0.16;
const TONE_LO: f32 = 0.08;
const RELIEF_GAIN: f32 = 2.0;
// Unsharp weight on the line field: what bends the isophotes round the arms.
const LINE_UNSHARP: f32 = 1.5;
const GALAXY_WASH: f32 = 0.22;

fn texel(t: texture_2d<f32>, ip: vec2<i32>) -> vec4<f32> {
  let size = vec2<i32>(textureDimensions(t));
  return textureLoad(t, clamp(ip, vec2<i32>(0), size - 1), 0);
}

fn layerTexel(t: texture_2d_array<f32>, layer: i32, ip: vec2<i32>) -> vec4<f32> {
  let size = vec2<i32>(textureDimensions(t));
  return textureLoad(t, clamp(ip, vec2<i32>(0), size - 1), layer, 0);
}

fn bodyCover(ip: vec2<i32>) -> f32 {
  return select(0.0, coverOf(texel(bodyTex, ip), u.flags), (u.flags & FLAG_BODIES) != 0u);
}

// Where the scene's depth breaks: a rover against the ground behind it, a crater
// rim against the plain beyond. Only inside an atmosphere, where `bodyTex` holds
// depth (`cover.wesl`). Reversed-Z depth is linear in screen space across any
// plane, so its second difference is ~0 on open ground at any slant and jumps at
// an occluding edge: relative to the nearest tap, DEPTH_JUMP ≈ a 5% step in range.
fn depthEdge(ip: vec2<i32>, o: i32) -> f32 {
  if ((u.flags & FLAG_DEPTH_COVER) == 0u) {
    return 0.0;
  }
  let c = texel(bodyTex, ip).r;
  let l = texel(bodyTex, ip - vec2<i32>(o, 0)).r;
  let r = texel(bodyTex, ip + vec2<i32>(o, 0)).r;
  let d = texel(bodyTex, ip - vec2<i32>(0, o)).r;
  let t = texel(bodyTex, ip + vec2<i32>(0, o)).r;
  let nearest = max(max(c, max(l, r)), max(d, t));
  let jump = max(abs(l + r - 2.0 * c), abs(d + t - 2.0 * c)) / max(nearest, 1e-30);
  return smoothstep(DEPTH_JUMP * 0.7, DEPTH_JUMP * 1.3, jump);
}

// A body's land share at `uv`: bilinear over the quarter-res cells that carry one
// (`landWeight`). A plain bilinear tap mixed the sky's −1 into a land share at the
// limb and cut a false coast round it. No mapped cell near reads as land.
fn landAt(uv: vec2<f32>) -> f32 {
  let f = uv * vec2<f32>(textureDimensions(quarterTex)) - 0.5;
  let base = vec2<i32>(floor(f));
  let t = fract(f);
  var sum = 0.0;
  var weight = 0.0;
  for (var k = 0; k < 4; k++) {
    let o = vec2<i32>(k & 1, k >> 1u);
    let a = layerTexel(quarterTex, WASH_LAYER, base + o).a;
    let w = mix(1.0 - t.x, t.x, f32(o.x)) * mix(1.0 - t.y, t.y, f32(o.y)) * landWeight(a);
    sum += w * a;
    weight += w;
  }
  return select(1.0, sum / weight, weight > 1e-4);
}

// A 1/16-res low band smoothed over nine bilinear taps: contours drawn on it
// must be curves, not the stair-steps of its texels.
fn lowBandAt(layer: i32, uv: vec2<f32>) -> vec4<f32> {
  let t = 1.0 / vec2<f32>(textureDimensions(lowTex));
  var sum = textureSampleLevel(lowTex, linear, uv, layer, 0.0) * 4.0;
  for (var k = 0; k < 8; k++) {
    let a = f32(k) * 0.7853982;
    let w = select(1.0, 2.0, (k & 1) == 0);
    sum += textureSampleLevel(lowTex, linear, uv + vec2<f32>(cos(a), sin(a)) * t * 2.0, layer, 0.0) * w;
  }
  return sum / 16.0;
}

// Dutch outline colour's band, from a field's signed px inside its boundary: it
// fades inward from the line, clear pigment with no pooled rim (a dark ragged
// edge read as foxing, not colour).
fn outlineBand(insidePx: f32) -> f32 {
  return step(0.0, insidePx) * (1.0 - smoothstep(0.0, 14.0 * u.unit, insidePx));
}

// The boundary line and one inner contour of a low band, before their dots.
fn outlineLevels(l: f32, perPx: f32, edge: f32, core: f32) -> f32 {
  let w = 0.9 * u.unit;
  return max(
    1.0 - smoothstep(w, w + 1.0, abs(l - edge) / perPx),
    0.8 * (1.0 - smoothstep(w, w + 1.0, abs(l - core) / perPx)),
  );
}

// The wash's hue at the band's scale, 1.5 quarter-res cells round.
fn washHue(uv: vec2<f32>) -> vec3<f32> {
  let t = 1.5 / vec2<f32>(textureDimensions(quarterTex));
  var sum = textureSampleLevel(quarterTex, linear, uv, WASH_LAYER, 0.0).rgb * 4.0;
  for (var k = 0; k < 8; k++) {
    let a = f32(k) * 0.7853982;
    let w = select(1.0, 2.0, (k & 1) == 0);
    sum += textureSampleLevel(quarterTex, linear, uv + vec2<f32>(cos(a), sin(a)) * t, WASH_LAYER, 0.0).rgb * w;
  }
  return sum / 16.0;
}

// A galaxy cut as Mellan cut the Moon: iso-lines on its isophotes, swelling
// with tone, stipple in the faint disc, a dotted outline at the field-adaptive
// level and a solid core; dust lanes stay paper. Derivatives come in from the
// caller's uniform flow. x ink, y wash amount, z warmth (0 smalt, 1 gamboge).
fn galaxyEngraving(ip: vec2<i32>, uv: vec2<f32>, src: vec3<f32>, neb: vec4<f32>, lowL: f32,
                   coherence: f32, h: f32, hPerUnit: f32, fwSm: f32, edgeLevel: f32,
                   big: f32) -> vec3<f32> {
  let p = vec2<f32>(ip) / u.unit;
  let pxUnits = 1.0 / u.unit;
  let lxs = neb.x;
  let lc = clamp(log((lxs + 0.02) / (lowL + 0.02)), -1.5, 1.5);
  let ramp = smoothstep(TONE_LO, 1.0, lxs);
  let tone = clamp(ramp * sqrt(ramp) * clamp(1.0 + RELIEF_GAIN * lc, 0.25, 1.6), 0.0, 1.0);
  // The burin lifts in the faintest tone and below the line onset. Where the
  // isophotes run every way (a star field's speckle, glow.wesl) lines would
  // wander as fingerprints: stipple by tone there instead.
  let cut = isoLines(h, hPerUnit, tone, pxUnits) * smoothstep(0.03, 0.09, tone);
  let lines = mix(stipple(p, 2.0, tone * 0.8), cut, smoothstep(0.38, 0.46, coherence))
    * smoothstep(LINE_ON - 0.03, LINE_ON + 0.03, lxs);
  let faint = clamp(smoothstep(GALAXY_EDGE - 0.02, LINE_ON + 0.05, lxs) * clamp(1.0 + 0.8 * lc, 0.2, 1.6), 0.0, 1.0);
  let dots = stipple(p, 2.0, faint * 0.45) * (1.0 - smoothstep(LINE_ON, LINE_ON + 0.06, lxs));
  let edgePx = abs(neb.y - edgeLevel) / fwSm;
  let outline = (1.0 - smoothstep(0.9 * u.unit, 0.9 * u.unit + 1.0, edgePx)) * stipple(p, 2.3, 0.4);
  // Lanes: the print eroded by a one-unit cross loses its stars but keeps a
  // lane, a notch below the band's local max; or a warm notch, since dust
  // reddens (warmth alone is a yellow bar or bulge, not dust).
  let o = i32(round(u.unit));
  var ero = luma(src);
  var sum = src;
  for (var k = 0; k < 4; k++) {
    let step1 = select(-o, o, (k & 1) == 1);
    let c = texel(printTex, ip + select(vec2<i32>(step1, 0), vec2<i32>(0, step1), k >= 2)).rgb;
    ero = min(ero, luma(c));
    sum += c;
  }
  let hue = washHue(uv);
  let notch = 1.0 - ero / max(neb.w, 0.05);
  let mean = sum / 5.0;
  let warmPrint = (mean.r - mean.b) / max(mean.r + mean.g + mean.b, 0.05);
  let warmBand = (hue.r - hue.b) / max(hue.r + hue.g + hue.b, 0.05);
  let red = smoothstep(0.035, 0.08, warmPrint - warmBand) * smoothstep(0.10, 0.25, notch);
  let keep = 1.0 - max(smoothstep(0.30, 0.55, notch), red) * smoothstep(0.18, 0.30, lxs);
  let core = smoothstep(0.90, 0.97, min(lxs, luma(mean))) * keep;
  let ink = max(max(max(lines, dots) * keep, outline) * big, core);
  let chroma = max(hue.r, max(hue.g, hue.b)) - min(hue.r, min(hue.g, hue.b));
  let wash = GALAXY_WASH * smoothstep(GALAXY_EDGE, GALAXY_EDGE + 0.1, lxs) * smoothstep(0.03, 0.10, chroma) * big;
  return vec3<f32>(ink, wash, smoothstep(-0.04, 0.06, hue.r - hue.b));
}

// The colour a whole glow is washed in, judged over ~5 of its texels, so one
// region takes one hue rather than a patchwork.
fn glowHue(uv: vec2<f32>) -> vec3<f32> {
  let t = 1.0 / vec2<f32>(textureDimensions(lowTex));
  var sum = vec3<f32>(0.0);
  for (var k = 0; k < 8; k++) {
    let a = f32(k) * 0.7853982;
    sum += textureSampleLevel(lowTex, linear, uv + vec2<f32>(cos(a), sin(a)) * t * 4.0, GLOW_LAYER, 0.0).rgb;
  }
  return sum / 8.0;
}

fn viewRay(uv: vec2<f32>) -> vec3<f32> {
  let top = mix(u.rayTL.xyz, u.rayTR.xyz, uv.x);
  let bottom = mix(u.rayBL.xyz, u.rayBR.xyz, uv.x);
  return normalize(mix(top, bottom, uv.y));
}

// Ink of the border digits. Four taps per pixel: the glyphs are set at 64 px
// and drawn at 7–15, so a single bilinear tap would alias their hairlines.
fn numeralInk(px: vec2<f32>) -> f32 {
  var ink = 0.0;
  for (var i = 0u; i < lettering.count; i++) {
    let half = lettering.items[i].half;
    let local = (px - lettering.items[i].centre) / half;
    if (abs(local.x) > 1.0 || abs(local.y) > 1.0) {
      continue;
    }
    let rect = lettering.items[i].rect;
    let texel = (rect.zw - rect.xy) / (2.0 * half);
    let at = mix(rect.xy, rect.zw, local * 0.5 + 0.5);
    var sum = 0.0;
    for (var k = 0; k < 4; k++) {
      let o = vec2<f32>(f32(k & 1), f32(k >> 1u)) - 0.5;
      sum += textureSampleLevel(glyphTex, linear, at + o * texel * 0.5, 0.0).r;
    }
    ink = max(ink, sum * 0.25);
  }
  return ink;
}

// A body's light at the terminator's scale — nine quarter-res taps ~6 cells
// apart, body cells only (wash.a >= 0) — so albedo (dark forest, bright desert,
// a sea glint) never reads as shade, and a thin ring is not darkened by the sky.
fn bodyLight(uv: vec2<f32>) -> f32 {
  let t = 6.0 / vec2<f32>(textureDimensions(quarterTex));
  let c = textureSampleLevel(quarterTex, linear, uv, WASH_LAYER, 0.0).rgb;
  var light = max(c.r, max(c.g, c.b)) * 2.0;
  var weight = 2.0;
  for (var k = 0; k < 8; k++) {
    let a = f32(k) * 0.7853982;
    let s = textureSampleLevel(quarterTex, linear, uv + vec2<f32>(cos(a), sin(a)) * t, WASH_LAYER, 0.0);
    let w = step(0.0, s.a);
    light += max(s.r, max(s.g, s.b)) * w;
    weight += w;
  }
  return light / weight;
}

// The nearest recorded body along the ray.
fn castPlateBodies(ray: vec3<f32>) -> BodyHit {
  var best = BodyHit(1e30, 0.0, 0.0, 0.0, 0.0, false, false, false, 1e30, 0u);
  for (var i = 0u; i < min(plate.count, 4u); i++) {
    var h = castPlateBody(ray, plate.items[i]);
    if (h.t < best.t) {
      h.index = i;
      best = h;
    }
  }
  return best;
}

// Neatline: heavy outer rule, hairline inner rule, and between them the degree
// ladder in the cells of the ruling frame under it (a globe's where the band
// lies over one, else the sky's), so its chequer registers with the rulings and
// the numbers (`placeAntiqueNumerals` picks the same way). x: ink, y: inside the plate.
fn neatline(px: vec2<f32>, uv: vec2<f32>) -> vec2<f32> {
  let p = px / u.unit;
  let size = u.res / u.unit;
  let inset = min(min(p.x, size.x - p.x), min(p.y, size.y - p.y)) - MARGIN;
  let outer = 1.0 - smoothstep(0.0, 0.5, abs(inset + 1.0) - 1.0);
  let inner = 1.0 - smoothstep(0.0, 0.4, abs(inset - BAND) - 0.3);
  let horizontalEdge = min(p.y, size.y - p.y) < min(p.x, size.x - p.x);
  // Read the coordinate on the band's centre line, not at this pixel, so each
  // chequer cell is square to the edge instead of cut along the iso-line.
  var ladder = 0.0;
  // Only the band itself needs the coordinate (two inverse trig calls a pixel).
  if (inset > 1.6 && inset < BAND - 0.6) {
    let mid = MARGIN + BAND * 0.5;
    let alongY = select(size.y - mid, mid, p.y < size.y * 0.5) / size.y;
    let alongX = select(size.x - mid, mid, p.x < size.x * 0.5) / size.x;
    let onLine = select(vec2<f32>(alongX, uv.y), vec2<f32>(uv.x, alongY), horizontalEdge);
    let ray = viewRay(onLine);
    let g = globeNormal(u.globe, ray);
    let onGlobe = u.globe.steps.x > 0.0 && g.w > 0.0;
    let ll = select(frameLonLat(u.sky, ray), frameLonLat(u.globe, g.xyz), onGlobe);
    let steps = select(u.sky.steps, u.globe.steps, onGlobe);
    let coord = select(ll.y, ll.x, horizontalEdge);
    let cell = select(steps.w, steps.z, horizontalEdge);
    ladder = f32(i32(floor(coord / cell)) % 2 == 0);
  }
  return vec2<f32>(max(max(outer, inner), ladder), smoothstep(BAND, BAND + 0.6, inset));
}

// The plate mark: the copper plate's bevelled edge pressed into the sheet, a
// rounded rectangle lit from the top left; inside it, plate tone.
fn plateMark(px: vec2<f32>) -> f32 {
  let p = px / u.unit;
  let size = u.res / u.unit;
  // A plate's corners were filed only slightly round: more reads as a UI card.
  let radius = 2.0;
  let half = size * 0.5 - vec2<f32>(PLATE + radius);
  let q = abs(p - size * 0.5) - half;
  let d = -(length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - radius);
  // Embossed, not printed: a light ridge beside a dark one, swapped on the sides
  // facing away from the light; inside, only a whisper of plate tone.
  let toLight = sign(dot(normalize(p - size * 0.5), vec2<f32>(-0.6, -0.8)));
  let ridge = exp(-pow((d + 0.6) / 0.55, 2.0)) - exp(-pow((d - 0.6) / 0.55, 2.0));
  return ridge * toLight * 0.11 - smoothstep(0.0, 2.0, d) * 0.012;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let px = in.pos.xy;
  let ip = vec2<i32>(px);
  let p = px / u.unit;
  let uv = in.uv;

  let sheet = layerTexel(fullTex, PAPER_LAYER, ip);
  let src = texel(printTex, ip).rgb;
  let body = bodyCover(ip);
  let sky = 1.0 - body;
  let frame = neatline(px, uv);
  let paperTone = sheet.rgb * (1.0 + plateMark(px));
  var col = paperTone;

  // Dutch outline colour on the low band: a band 20 units wide inside each
  // glow's boundary, fading inward to plain paper, offset from the engraved
  // line by a slow misregistration field as a colourist's brush was.
  let slip = (vec2<f32>(vnoise(p * 0.018 + 3.0), vnoise(p * 0.018 + 9.0)) - 0.5) * 0.006;
  let glow = lowBandAt(GLOW_LAYER, uv);
  let lowL = luma(glow.rgb);
  // The colour band reads the same field a little displaced: the brush's slip,
  // approximated to first order from the field's own gradient.
  let glowL = lowL + dot(vec2<f32>(dpdx(lowL), dpdy(lowL)), slip * u.res);
  let lowPerPx = max(fwidth(lowL), 1e-5);
  let inside = (glowL - GLOW_EDGE) / lowPerPx;
  // A galaxy is engraved only where it is big enough to light the 1/16 glow
  // over this frame's field floor (a star's halo is not a nebula; a dense
  // survey field is not one). Elsewhere the outline colour below still holds.
  let floorL = skyFloor;
  let edgeLevel = max(GALAXY_EDGE, 2.5 * floorL);
  let big = smoothstep(1.8 * floorL + 0.03, 2.6 * floorL + 0.05, lowL);
  let neb = textureSampleLevel(quarterTex, linear, uv, NEBULA_LAYER, 0.0);
  let h = log(neb.z + 0.01) + LINE_UNSHARP * (log(neb.z + 0.02) - log(lowL + 0.02));
  let hPerUnit = max(length(vec2<f32>(dpdx(h), dpdy(h))), 1e-6) * u.unit;
  let fwSm = max(fwidth(neb.y), 1e-5);
  var galaxy = vec3<f32>(0.0);
  if (sky > 0.0 && max(neb.x, neb.y) > 0.8 * edgeLevel) {
    galaxy = galaxyEngraving(ip, uv, src, neb, lowL, clamp(glow.a, 0.0, 1.0), h, hPerUnit, fwSm, edgeLevel, big);
  }
  let band = outlineBand(inside) * sky * (1.0 - big);
  // A structure's disc (cluster, void, group) is outlined from its own row, never engraved.
  let structure = lowBandAt(STRUCTURE_GLOW_LAYER, uv);
  let structL = structure.a;
  let structPerPx = max(fwidth(structL), 1e-5);
  let structSlipL = structL + dot(vec2<f32>(dpdx(structL), dpdy(structL)), slip * u.res);
  let structBand = outlineBand((structSlipL - STRUCTURE_EDGE) / structPerPx) * sky;
  // The hue is only needed where the band paints.
  var hue = vec3<f32>(0.0);
  if (band > 0.0) {
    hue = glowHue(uv);
  }
  // Colour gathers on the subject at the plate's centre and thins toward its
  // edges (to ~30%), so the eye lands on the subject, not the margins.
  let focus = 1.0 - 0.7 * smoothstep(0.18, 0.62, length((uv - 0.5) * vec2<f32>(u.res.x / u.res.y, 1.0)) * 0.9);
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

  let ornament = layerTexel(fullTex, DECOR_LAYER, ip);
  col = mix(col, paperTone, ornament.b);
  // Figures lie on the sky, behind any body; only a clearing ornament covers one.
  let behind = max(sky, ornament.b);
  col = applyWash(col, max(layerTexel(fullTex, DECOR_HUE_LAYER, ip).rgb, vec3<f32>(1e-3)), ornament.a * 0.55 * behind * frame.y);

  // Sky: glyphs for stars, the galaxy engraving, and on wider faint light the
  // boundary line and one inner contour of the low band. Star glyphs were scattered by glyphs.wesl: x ink, y paper knock-out.
  let star = layerTexel(fullTex, STAR_INK_LAYER, ip);
  let clear = 1.0 - star.y;
  // A glow's edge is dotted, as Bayer and de Wit drew a nebula's: a solid
  // ragged line here would read as a coast.
  let onEdge = max(
    outlineLevels(lowL, lowPerPx, GLOW_EDGE, GLOW_CORE) * (1.0 - big),
    outlineLevels(structL, structPerPx, STRUCTURE_EDGE, STRUCTURE_CORE),
  );
  var contour = 0.0;
  if (onEdge > 0.0) {
    contour = onEdge * stipple(p, 2.3, 0.4);
  }
  // The web chart (`web.wesl`): z its ink, w how much of a field galaxy its voids
  // lift; an engraved (big) galaxy is a subject, never lifted.
  let skyInk = max(star.x, max(max(galaxy.x * max(1.0 - star.w, big), star.z), contour) * clear) * sky;
  // The rulings were cut by hand too: their ink load wanders along their length.
  let ray = viewRay(uv);
  let skyRulings = max(graticule(frameLonLat(u.sky, ray), u.sky.steps, u.unit), skyCircles(ray, u.sky, u.unit));
  // A globe's net, on its own pixels: clear of its town signs and molehills (their paper, as
  // `bodies/earth.wesl` reads it), crossing its borders and rivers as the maps' did.
  var globeRulings = 0.0;
  if (u.globe.lon90.w > 0.0) {
    let g = globeNormal(u.globe, ray);
    let signs = clamp(2.0 * texel(geographyTex, ip).a, 0.0, 1.0);
    globeRulings = graticule(frameLonLat(u.globe, g.xyz), u.globe.steps, u.unit) * g.w * u.globe.lon90.w * (1.0 - signs);
  }
  let rulings = (skyRulings * sky * clear + globeRulings * body) * (0.7 + 0.45 * vnoise(p * 0.045));
  // Constellation figures and orbits as a fine rule, a shade lighter than the
  // rulings: only a line's core inks, so a trail drawn wide still cuts thin.
  let lines = smoothstep(0.55, 0.95, texel(linesTex, ip).a / LINE_ALPHA) * sky * clear * 0.7;

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
  let seaPerUnit = length(vec2<f32>(dpdx(seaD), dpdy(seaD))) * u.unit;
  let o = i32(round(u.unit));
  let gx = bodyCover(ip + vec2<i32>(o, 0)) - bodyCover(ip - vec2<i32>(o, 0));
  let gy = bodyCover(ip + vec2<i32>(0, o)) - bodyCover(ip - vec2<i32>(0, o));
  let limb = max(smoothstep(0.25, 0.7, length(vec2<f32>(gx, gy))), depthEdge(ip, o));
  var bodyInk = 0.0;
  if (body > 0.0) {
    let pxUnits = 1.0 / u.unit;
    let n = vec2<f32>(-sin(u.hatchAngle), cos(u.hatchAngle));
    let along = dot(p, vec2<f32>(n.y, -n.x));
    let hit = castPlateBodies(viewRay(uv));
    var tone = 0.0;
    var form = vec3<f32>(dot(p, n), along, 1.0);
    var lines = 0.0;
    var print = PRINT_PLAIN;
    var marsForm = form;
    var moon = MoonTone(0.0, 0.0, 0.0);
    let relief = texel(reliefTex, ip);
    let ground = (u.flags & FLAG_RELIEF) != 0u && relief.a != 0.0;
    if (hit.t < 1e30) {
      let b = plate.items[hit.index];
      let radius = b.centre.w;
      // Gradients from two more casts a pixel over: no dpdx inside this branch.
      let rayX = viewRay(uv + vec2<f32>(1.0 / u.res.x, 0.0));
      let rayY = viewRay(uv + vec2<f32>(0.0, 1.0 / u.res.y));
      if (hit.onRing) {
        // Paper, but for the ball's shadow, hatched ALONG the ring as concentric ellipses.
        let rhoPerUnit = length(vec2<f32>(ringRho(rayX, b), ringRho(rayY, b)) - hit.rho) * u.unit;
        tone = select(0.0, 0.6, hit.ballShadow);
        form = vec3<f32>(hit.rho * radius, along, rhoPerUnit * radius);
        lines = ringLines(hit.rho, rhoPerUnit, b.ringEdges, p, pxUnits);
      } else {
        // Half the screen line, half the Sun's parallel: lines bow with the globe
        // yet still cross the tone's contours, so they taper at both ends. `n`
        // points away from the Sun, as the arc grows: the halves add, never cancel.
        print = printOf(b);
        tone = formTone(hit.ndl, hit.ndv);
        // The Moon's own row (`fsMoonPrint`) holds its relief: g 0 where it did not run.
        let moonRow = print == PRINT_MOON && relief.g > 0.0;
        if (print == PRINT_MOON) {
          moon = moonTone(hit.ndl, hit.ndv, relief.g);
          tone = moon.tone;
        }
        // The ring's shadow on the ball is one solid stroke, not hatching.
        if (hit.ringShadow) {
          tone = max(tone, 0.85);
          lines = 0.95;
        }
        if (tone > 0.06) {
          let phase = 0.5 * dot(p, n) + 0.5 * radius * hit.theta;
          let screenStep = 0.5 * n * pxUnits;
          let dx = screenStep.x + 0.5 * radius * (ballTheta(rayX, b) - hit.theta);
          let dy = screenStep.y + 0.5 * radius * (ballTheta(rayY, b) - hit.theta);
          form = vec3<f32>(phase, along, length(vec2<f32>(dx, dy)) * u.unit);
        }
        if (moonRow) {
          form = moonWallForm(form, relief.a, texel(reliefTex, ip + vec2<i32>(1, 0)).a,
            texel(reliefTex, ip + vec2<i32>(0, 1)).a, texel(reliefTex, ip - vec2<i32>(1, 0)).a,
            texel(reliefTex, ip - vec2<i32>(0, 1)).a, u.unit);
        }
        if (print == PRINT_MARS) {
          let lat = ballLatitude(viewRay(uv), b);
          let dLat = vec2<f32>(ballLatitude(rayX, b), ballLatitude(rayY, b)) - lat;
          marsForm = vec3<f32>(radius * lat, along, length(dLat) * radius * u.unit);
        }
      }
      lines = max(lines, inkLine(hit.edgeUnits, 1.1, pxUnits));
    } else {
      tone = select(1.0 - smoothstep(0.015, 0.17, bodyLight(uv)), 0.0, ground);
    }
    bodyInk = max(crossHatch(form, p, tone, HATCH, u.hatchAngle, pxUnits), lines);
    let cover = body * frame.y;
    if (print == PRINT_EARTH) {
      let e = EarthPrintIn(p, pxUnits, u.unit, tone, landShare, landPerPx,
        landAt(uv + slip * 0.6), blurredShare, seaD, seaPerUnit, texel(geographyTex, ip));
      let earth = earthPrint(col, cover, e);
      col = earth.col;
      bodyInk = max(bodyInk, earth.ink);
    } else if (print == PRINT_MARS) {
      let mars = marsPrint(col, cover, landShare, marsForm, p, pxUnits);
      col = mars.col;
      // A marking is a globe's feature: on the engraved ground the relief speaks.
      bodyInk = max(bodyInk, select(mars.ink, 0.0, ground));
    } else if (print == PRINT_MOON && relief.g > 0.0) {
      bodyInk = max(bodyInk, max(moonMare(relief.r, moon.litSlope, p, pxUnits), moonRims(relief.b, moon.shade)));
    }
    if (ground) {
      let around = luma(textureSampleLevel(quarterTex, linear, uv, WASH_LAYER, 0.0).rgb);
      bodyInk = max(bodyInk, marsRelief(reliefTex, linear, px, relief, u.unit, luma(src), around));
    }
    bodyInk *= body;
  }

  let figure = ornament.r * clear * sky;
  var scene = max(max(max(bodyInk, limb), max(skyInk, max(rulings, lines))), figure) * (1.0 - ornament.b);
  // Captions at full ink, each on its own knock-out of the engraving and wash
  // beneath it, as an engraver lettered over the work. Bare paper has nothing
  // to clear, so it skips the halo's taps.
  var captions = 0.0;
  if ((u.flags & FLAG_CAPTIONS) != 0u) {
    // Ink from the letters' light fill only; their dark contrast outline (drawn
    // for a black sky) feeds the paper halo instead of thickening the type.
    let ov = texel(overlayTex, ip);
    captions = smoothstep(0.03, 0.2, ov.a) * smoothstep(0.3, 0.6, luma(ov.rgb / max(ov.a, 1e-3)));
    if (scene > 0.0 || any(col != paperTone)) {
      let halo = captionHalo(overlayTex, ip, u.unit, ov.a);
      col = mix(col, paperTone, halo);
      scene *= 1.0 - halo;
    }
  }
  let lettered = max(scene, captions);
  // The border's digits only exist along the edges: skip their loop elsewhere.
  var numerals = 0.0;
  let sideUnits = min(p.x, u.res.x / u.unit - p.x);
  let rowUnits = min(p.y, u.res.y / u.unit - p.y);
  if (rowUnits < MARGIN + BAND + 30.0 || sideUnits < NUMERAL_SIDE_REACH) {
    numerals = numeralInk(px) * (1.0 - ornament.b);
  }
  let content = max(lettered, max(ornament.g, numerals));
  var ink = max(content * frame.y, frame.x);
  // The plate is wiped by hand and printed on laid paper: the ink's edge is
  // ragged by a few tenths of a unit and the sheet's dips take less of it.
  let rag = (vnoise(p * 1.7) - 0.5) * 0.35;
  let edgeInk = min(ink, 1.0);
  ink = max(ink + rag * edgeInk * (1.0 - edgeInk) * 4.0, 0.0);
  ink *= 0.72 + 0.28 * smoothstep(0.25, 0.65, sheet.a);
  // Ink as density: one full stroke leaves INK's transmittance, a crossing more.
  col *= pow(INK, vec3<f32>(ink));
  return vec4<f32>(col, 1.0);
}
