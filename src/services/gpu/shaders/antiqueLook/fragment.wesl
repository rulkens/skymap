// antiqueLook/fragment.wesl — the plate: the tone-mapped frame re-cut as an
// engraved, hand-coloured chart on the baked sheet.
//
// Two regimes, split by foreground:0's alpha. Sky is INVERTED, as on every
// period chart: bare paper where space is empty, a glyph per star (from the
// suppressed quarter-res peaks), and the low band of light — glows, nebulae,
// structure discs — as Dutch outline colour: a crisp boundary line with a band
// of wash fading inward and plain paper inside, never solid ink. Bodies are
// engraved the classic way: hatching parallel to the terminator, swelling into
// shadow, crossed at 45° on the night side; seas left pale with a coast halo.

import package::antiqueLook::io::AntiqueUniforms;
import package::antiqueLook::io::VSOut;
import package::antiqueLook::paper::vnoise;
import package::antiqueLook::engraving::crossHatch;
import package::antiqueLook::engraving::stipple;
import package::antiqueLook::engraving::coastHalo;
import package::antiqueLook::graticule::graticule;
import package::antiqueLook::graticule::raDec;
import package::antiqueLook::pigments::luma;
import package::antiqueLook::pigments::regionPigment;
import package::antiqueLook::pigments::chromaOf;
import package::antiqueLook::pigments::applyWash;
import package::antiqueLook::pigments::pigmentAt;

@group(0) @binding(0) var printTex: texture_2d<f32>;
@group(0) @binding(1) var overlayTex: texture_2d<f32>;
@group(0) @binding(2) var bodyTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> u: AntiqueUniforms;
@group(0) @binding(4) var paperTex: texture_2d<f32>;
@group(0) @binding(5) var washTex: texture_2d<f32>;
@group(0) @binding(6) var starInkTex: texture_2d<f32>;
@group(0) @binding(7) var linear: sampler;
@group(0) @binding(8) var glowTex: texture_2d<f32>;
// Scattered by decor.wesl: r figure ink, g plate ink, b clear, a wash; and its hue.
@group(0) @binding(9) var decorTex: texture_2d<f32>;
@group(0) @binding(10) var decorHueTex: texture_2d<f32>;
@group(0) @binding(11) var<uniform> lettering: AntiqueLettering;
@group(0) @binding(12) var glyphTex: texture_2d<f32>;

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
// Sheet layout in print units: bare margin with the plate mark in it, then the
// neatline band. Mirrored by ANTIQUE_LADDER_UNITS (data/rendering/antiqueLook.ts).
const PLATE: f32 = 15.0;
const MARGIN: f32 = 30.0;
const BAND: f32 = 7.0;
// Hatch spacing on bodies, print units.
const HATCH: f32 = 5.0;
// Glow levels: the outline-colour boundary, and one inner contour.
const GLOW_EDGE: f32 = 0.13;
const GLOW_CORE: f32 = 0.4;

fn texel(t: texture_2d<f32>, ip: vec2<i32>) -> vec4<f32> {
  let size = vec2<i32>(textureDimensions(t));
  return textureLoad(t, clamp(ip, vec2<i32>(0), size - 1), 0);
}

fn bodyCover(ip: vec2<i32>) -> f32 {
  return select(0.0, texel(bodyTex, ip).a, (u.flags & FLAG_BODIES) != 0u);
}

// The low band at 1/16 res, smoothed over nine bilinear taps: contours drawn on
// it must be curves, not the stair-steps of its texels.
fn glowAt(uv: vec2<f32>) -> vec3<f32> {
  let t = 1.0 / vec2<f32>(textureDimensions(glowTex));
  var sum = textureSampleLevel(glowTex, linear, uv, 0.0).rgb * 4.0;
  for (var k = 0; k < 8; k++) {
    let a = f32(k) * 0.7853982;
    let w = select(1.0, 2.0, (k & 1) == 0);
    sum += textureSampleLevel(glowTex, linear, uv + vec2<f32>(cos(a), sin(a)) * t * 2.0, 0.0).rgb * w;
  }
  return sum / 16.0;
}

// The colour a whole glow is washed in, judged over ~5 of its texels, so one
// region takes one hue rather than a patchwork.
fn glowHue(uv: vec2<f32>) -> vec3<f32> {
  let t = 1.0 / vec2<f32>(textureDimensions(glowTex));
  var sum = vec3<f32>(0.0);
  for (var k = 0; k < 8; k++) {
    let a = f32(k) * 0.7853982;
    sum += textureSampleLevel(glowTex, linear, uv + vec2<f32>(cos(a), sin(a)) * t * 4.0, 0.0).rgb;
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
  let t = 6.0 / vec2<f32>(textureDimensions(washTex));
  let c = textureSampleLevel(washTex, linear, uv, 0.0).rgb;
  var light = max(c.r, max(c.g, c.b)) * 2.0;
  var weight = 2.0;
  for (var k = 0; k < 8; k++) {
    let a = f32(k) * 0.7853982;
    let s = textureSampleLevel(washTex, linear, uv + vec2<f32>(cos(a), sin(a)) * t, 0.0);
    let w = step(0.0, s.a);
    light += max(s.r, max(s.g, s.b)) * w;
    weight += w;
  }
  return light / weight;
}

// How near the coast an ocean pixel lies, from the quarter-res land share: land
// within ~3 cells counts fully, within ~7 cells half. 1 at the shore, 0 far out.
fn coastNear(uv: vec2<f32>) -> f32 {
  let t = 1.0 / vec2<f32>(textureDimensions(washTex));
  var near = 0.0;
  for (var k = 0; k < 8; k++) {
    let a = f32(k) * 0.7853982;
    let dir = vec2<f32>(cos(a), sin(a)) * t;
    near = max(near, clamp(textureSampleLevel(washTex, linear, uv + dir * 3.0, 0.0).a, 0.0, 1.0));
    near = max(near, 0.5 * clamp(textureSampleLevel(washTex, linear, uv + dir * 7.0, 0.0).a, 0.0, 1.0));
  }
  return near;
}

// Neatline: heavy outer rule, hairline inner rule, and between them the degree
// ladder in fifths of the plate's ruling interval, so its chequer registers
// with the rulings and the numbers. x: ink, y: inside the plate.
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
    let rd = raDec(viewRay(onLine));
    let coord = select(rd.y, rd.x, horizontalEdge);
    let cell = select(u.decStep, u.raStep, horizontalEdge) / 5.0;
    ladder = f32(i32(floor(coord / cell)) % 2 == 0);
  }
  return vec2<f32>(max(max(outer, inner), ladder), smoothstep(BAND, BAND + 0.6, inset));
}

// The plate mark: the copper plate's bevelled edge pressed into the sheet, a
// rounded rectangle lit from the top left; inside it, plate tone.
fn plateMark(px: vec2<f32>) -> f32 {
  let p = px / u.unit;
  let size = u.res / u.unit;
  let radius = 8.0;
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

  let sheet = texel(paperTex, ip);
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
  let lowL = luma(glowAt(uv));
  // The colour band reads the same field a little displaced: the brush's slip,
  // approximated to first order from the field's own gradient.
  let glowL = lowL + dot(vec2<f32>(dpdx(lowL), dpdy(lowL)), slip * u.res);
  let lowPerPx = max(fwidth(lowL), 1e-5);
  let inside = (glowL - GLOW_EDGE) / lowPerPx;
  // The band fades inward from the line, with the darker rim where it pooled.
  let band = step(0.0, inside) * (1.0 - smoothstep(0.0, 20.0 * u.unit, inside)
    + 0.35 * (1.0 - smoothstep(1.0 * u.unit, 3.0 * u.unit, inside))) * sky;
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
  let skyWash = band * 0.45 * focus * smoothstep(0.03, 0.12, chromaOf(hue));
  col = applyWash(col, regionPigment(hue), skyWash * sky * frame.y);

  let ornament = texel(decorTex, ip);
  col = mix(col, paperTone, ornament.b);
  col = applyWash(col, max(texel(decorHueTex, ip).rgb, vec3<f32>(1e-3)), ornament.a * 0.55 * frame.y);

  // Sky: glyphs for stars; the boundary line and one inner contour on the low
  // band; sparse stipple only where it is truly bright (the Milky Way's core).
  // Star glyphs were scattered by glyphs.wesl: x ink, y paper knock-out.
  let star = texel(starInkTex, ip).xy;
  let clear = 1.0 - star.y;
  let edgePx = abs(lowL - GLOW_EDGE) / lowPerPx;
  let corePx = abs(lowL - GLOW_CORE) / lowPerPx;
  // A glow's edge is dotted, as Bayer and de Wit drew a nebula's: a solid
  // ragged line here would read as a coast.
  let onEdge = max(
    1.0 - smoothstep(0.9 * u.unit, 0.9 * u.unit + 1.0, edgePx),
    0.8 * (1.0 - smoothstep(0.9 * u.unit, 0.9 * u.unit + 1.0, corePx)),
  );
  var contour = 0.0;
  if (onEdge > 0.0) {
    contour = onEdge * stipple(p, 2.3, 0.4);
  }
  var dots = 0.0;
  // Stipple only where a glow is truly bright: lower, it found square billboard
  // glows in the scene (a structure's own sprite) and printed them as blocks.
  if (lowL > 0.18) {
    dots = stipple(p, 2.2, smoothstep(0.18, 0.8, lowL) * 0.3);
  }
  let skyInk = max(star.x, max(dots, contour) * clear) * sky;
  // The rulings were cut by hand too: their ink load wanders along their length.
  let rulings = graticule(viewRay(uv), u.unit, u.raStep, u.decStep) * sky * clear * (0.7 + 0.45 * vnoise(p * 0.045));

  // Bodies, as a globe-maker engraved them: land and sea left as paper and
  // washed, every coast cut as one continuous line with the hatched halo off
  // it, and hatching (parallel to the terminator, swelling into shadow,
  // crossed past it) for the shade alone, read at the terminator's scale.
  // The land share's derivative is taken here, in uniform control flow; the
  // rest of the body work runs only where a body is.
  let wash = textureSampleLevel(washTex, linear, uv, 0.0);
  let landShare = clamp(wash.a, 0.0, 1.0);
  let landPerPx = max(fwidth(landShare), 1e-4);
  let o = i32(round(u.unit));
  let gx = bodyCover(ip + vec2<i32>(o, 0)) - bodyCover(ip - vec2<i32>(o, 0));
  let gy = bodyCover(ip + vec2<i32>(0, o)) - bodyCover(ip - vec2<i32>(0, o));
  let limb = smoothstep(0.25, 0.7, length(vec2<f32>(gx, gy)));
  var bodyInk = 0.0;
  if (body > 0.0) {
    let tone = 1.0 - smoothstep(0.015, 0.17, bodyLight(uv));
    let hatchInk = crossHatch(p, tone, HATCH, u.hatchAngle, 1.0 / u.unit);
    let ocean = 1.0 - smoothstep(0.35, 0.65, landShare);
    let coastPx = abs(landShare - 0.5) / landPerPx;
    let coast = 1.0 - smoothstep(0.55 * u.unit, 0.55 * u.unit + 1.0, coastPx);
    let near = coastNear(uv);
    let halo = coastHalo(p, near, 2.4) * ocean * (1.0 - tone);
    // Seas a pale smalt, pooled darker along the shore; land in the hue of its light.
    // The colourist's sea stops a little off the cut coast, by a slow wander.
    let washShare = clamp(textureSampleLevel(washTex, linear, uv + slip * 0.6, 0.0).a, 0.0, 1.0);
    let seaWash = (0.14 + 0.1 * near) * (1.0 - smoothstep(0.35, 0.65, washShare));
    // Land in Dutch outline colour: a band along each coast fading inward to paper.
    let landWash = 0.5 * smoothstep(0.35, 0.6, washShare) * (1.0 - smoothstep(0.62, 0.9, washShare));
    col = applyWash(col, pigmentAt(5.0), seaWash * body * frame.y);
    // Land in gamboge, the Dutch colourist's yellow, whatever its photograph's hue.
    col = applyWash(col, pigmentAt(2.0), landWash * body * frame.y);
    bodyInk = max(max(hatchInk, coast), halo * 0.85) * body;
  }

  // Captions at full ink, each on its own paper halo (a 2.5-unit knock-out of
  // everything engraved beneath it), as an engraver lettered over the work.
  var captions = 0.0;
  var captionHalo = 0.0;
  if ((u.flags & FLAG_CAPTIONS) != 0u) {
    // Ink from the letters' light fill only; their dark contrast outline (drawn
    // for a black sky) feeds the paper halo instead of thickening the type.
    let ov = texel(overlayTex, ip);
    captions = smoothstep(0.03, 0.2, ov.a) * smoothstep(0.3, 0.6, luma(ov.rgb / max(ov.a, 1e-3)));
    let reach = 3.5 * u.unit;
    for (var k = 0; k < 4; k++) {
      let a = f32(k) * 1.5707963 + 0.7853982;
      let tap = ip + vec2<i32>(round(vec2<f32>(cos(a), sin(a)) * reach));
      captionHalo = max(captionHalo, smoothstep(0.05, 0.3, texel(overlayTex, tap).a));
    }
  }

  let figure = ornament.r * clear;
  let scene = max(max(max(bodyInk, limb), max(skyInk, rulings)), figure) * (1.0 - ornament.b);
  let lettered = max(scene * (1.0 - captionHalo), captions);
  // The border's digits only exist along the edges: skip their loop elsewhere.
  var numerals = 0.0;
  let edgeUnits = min(min(p.x, u.res.x / u.unit - p.x), min(p.y, u.res.y / u.unit - p.y));
  if (edgeUnits < MARGIN + BAND + 30.0) {
    numerals = numeralInk(px);
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
