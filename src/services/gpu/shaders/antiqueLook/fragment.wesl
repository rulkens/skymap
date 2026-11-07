// antiqueLook/fragment.wesl — the plate: the tone-mapped frame re-cut as an
// engraved, hand-coloured chart on the baked sheet.
//
// Two regimes, split by foreground:0's alpha. Sky is INVERTED, as on every
// period chart: bare paper where space is empty, a glyph per star (from the
// suppressed quarter-res peaks), and the low band of light — glows, nebulae,
// structure discs — as a pigment wash with stipple and contour lines, never as
// solid ink. Bodies are engraved the classic way: shadow hatched, lit side
// paper, colour washed in, oceans waterlined, limb outlined.

import package::antiqueLook::io::AntiqueUniforms;
import package::antiqueLook::io::VSOut;
import package::antiqueLook::paper::vnoise;
import package::antiqueLook::engraving::crossHatch;
import package::antiqueLook::engraving::stipple;
import package::antiqueLook::engraving::starGlyph;
import package::antiqueLook::engraving::coastHalo;
import package::antiqueLook::graticule::graticule;
import package::antiqueLook::graticule::raDec;
import package::antiqueLook::graticule::niceStep;
import package::antiqueLook::pigments::luma;
import package::antiqueLook::pigments::nearestPigment;
import package::antiqueLook::pigments::chromaOf;
import package::antiqueLook::pigments::applyWash;
import package::antiqueLook::pigments::pigmentAt;
import package::antiqueLook::ornaments::AntiqueOrnaments;

@group(0) @binding(0) var printTex: texture_2d<f32>;
@group(0) @binding(1) var overlayTex: texture_2d<f32>;
@group(0) @binding(2) var bodyTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> u: AntiqueUniforms;
@group(0) @binding(4) var paperTex: texture_2d<f32>;
@group(0) @binding(5) var washTex: texture_2d<f32>;
@group(0) @binding(6) var starTex: texture_2d<f32>;
@group(0) @binding(7) var linear: sampler;
@group(0) @binding(8) var glowTex: texture_2d<f32>;
@group(0) @binding(9) var<uniform> orn: AntiqueOrnaments;
@group(0) @binding(10) var ornamentTex: texture_2d<f32>;
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
// Sheet layout in print units: bare margin, plate mark inside it, then the neatline band.
const PLATE: f32 = 9.0;
const MARGIN: f32 = 18.0;
const BAND: f32 = 7.0;
const CELL: f32 = 4.0;
// Star contrast below this prints nothing: the paper floor.
const STAR_FLOOR: f32 = 0.34;

fn texel(t: texture_2d<f32>, ip: vec2<i32>) -> vec4<f32> {
  let size = vec2<i32>(textureDimensions(t));
  return textureLoad(t, clamp(ip, vec2<i32>(0), size - 1), 0);
}

fn bodyCover(ip: vec2<i32>) -> f32 {
  return select(0.0, texel(bodyTex, ip).a, (u.flags & FLAG_BODIES) != 0u);
}

  return bodyCover(ip) * smoothstep(0.2, 0.45, around / 8.0);
}

// A tent over five bilinear taps: the 1/16 texels' diamonds smoothed out of the contours.
fn glowAt(uv: vec2<f32>) -> vec3<f32> {
  let t = 1.0 / vec2<f32>(textureDimensions(glowTex));
  var sum = textureSampleLevel(glowTex, linear, uv, 0.0).rgb * 2.0;
  sum += textureSampleLevel(glowTex, linear, uv + vec2<f32>(t.x, t.y) * 0.75, 0.0).rgb;
  sum += textureSampleLevel(glowTex, linear, uv + vec2<f32>(-t.x, t.y) * 0.75, 0.0).rgb;
  sum += textureSampleLevel(glowTex, linear, uv + vec2<f32>(t.x, -t.y) * 0.75, 0.0).rgb;
  sum += textureSampleLevel(glowTex, linear, uv + vec2<f32>(-t.x, -t.y) * 0.75, 0.0).rgb;
  return sum / 6.0;
}

fn viewRay(uv: vec2<f32>) -> vec3<f32> {
  let top = mix(u.rayTL.xyz, u.rayTR.xyz, uv.x);
  let bottom = mix(u.rayBL.xyz, u.rayBR.xyz, uv.x);
  return normalize(mix(top, bottom, uv.y));
}

// The ornaments covering this pixel. x: ink, y: clear-to-paper, z: wash, w: pigment.
fn ornamentLayer(px: vec2<f32>) -> vec4<f32> {
  var acc = vec4<f32>(0.0, 0.0, 0.0, 0.0);
  for (var i = 0u; i < orn.count; i++) {
    let d = px - orn.items[i].centre;
    let rot = orn.items[i].rot;
    // Screen y runs down, so a counter-clockwise turn by θ sends the sprite's
    // right to (cos θ, −sin θ) and its down to (sin θ, cos θ).
    let local = vec2<f32>(dot(d, vec2<f32>(rot.x, -rot.y)), dot(d, vec2<f32>(rot.y, rot.x))) / orn.items[i].half;
    if (abs(local.x) > 1.0 || abs(local.y) > 1.0) {
      continue;
    }
    let rect = orn.items[i].rect;
    let s = textureSampleLevel(ornamentTex, linear, mix(rect.xy, rect.zw, local * 0.5 + 0.5), 0.0);
    let o = orn.items[i].opacity;
    acc.x = max(acc.x, s.r * o);
    acc.y = max(acc.y, s.g * o * orn.items[i].clears);
    if (s.b * o > acc.z) {
      acc.z = s.b * o;
      acc.w = orn.items[i].pigment;
    }
  }
  return acc;
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

// Gather the suppressed peaks of the 5×5 cells around this pixel; each stamps a
// glyph from the ladder by its contrast. y: the knock-out — every glyph clears
// a paper halo 1.3× its size through the stipple, contours and rulings behind it.
fn starInk(px: vec2<f32>) -> vec2<f32> {
  let cell = vec2<i32>(px / CELL);
  var ink = 0.0;
  var knock = 0.0;
  for (var j = -2; j <= 2; j++) {
    for (var i = -2; i <= 2; i++) {
      let s = texel(starTex, cell + vec2<i32>(i, j));
      if (s.z < STAR_FLOOR) {
        continue;
      }
      // Contrast decides whether a star prints; the light it spreads, how large.
      let k = clamp((s.w - 0.05) / 0.6, 0.0, 1.0);
      let r = (0.7 + 3.4 * k) * u.unit;
      // Rays need room to read: under ~3 px a glyph is a dot, under ~6 px no glory.
      var rays = select(select(select(5.0, 6.0, k > 0.3), 8.0, k > 0.5), 12.0, k > 0.72);
      rays = select(0.0, rays, r >= 3.0);
      let glory = smoothstep(0.95, 1.0, k) * step(6.0, r);
      let q = px - s.xy;
      ink = max(ink, starGlyph(q, r, rays, glory));
      knock = max(knock, 1.0 - smoothstep(1.3 * r, 1.3 * r + 1.0, length(q)));
    }
  }
  return vec2<f32>(ink, knock);
}

// Neatline: heavy outer rule, hairline inner rule, and the degree ladder between —
// cells inked by the parity of the coordinate each edge cuts. x: ink, y: inside.
fn neatline(px: vec2<f32>, uv: vec2<f32>) -> vec2<f32> {
  let p = px / u.unit;
  let size = u.res / u.unit;
  let inset = min(min(p.x, size.x - p.x), min(p.y, size.y - p.y)) - MARGIN;
  let outer = 1.0 - smoothstep(0.0, 0.5, abs(inset + 0.9) - 0.9);
  let inner = 1.0 - smoothstep(0.0, 0.4, abs(inset - BAND) - 0.3);
  let rd = raDec(viewRay(uv));
  let horizontalEdge = min(p.y, size.y - p.y) < min(p.x, size.x - p.x);
  let coord = select(rd.y, rd.x, horizontalEdge);
  let perPx = max(fwidth(coord), 1e-5);
  let cell = niceStep(perPx, 14.0 * u.unit);
  let ladder = f32(i32(floor(coord / cell)) % 2 == 0) * step(1.6, inset) * step(inset, BAND - 0.6);
  return vec2<f32>(max(max(outer, inner), ladder), smoothstep(BAND, BAND + 0.6, inset));
}

// The plate mark: the copper plate's bevel pressed into the sheet, lit from the top left.
fn plateMark(px: vec2<f32>) -> f32 {
  let p = px / u.unit;
  let size = u.res / u.unit;
  let dx = min(p.x, size.x - p.x) - PLATE;
  let dy = min(p.y, size.y - p.y) - PLATE;
  let d = min(dx, dy);
  let lit = select(select(-1.0, 1.0, p.y < size.y * 0.5), select(-1.0, 1.0, p.x < size.x * 0.5), dx < dy);
  let bevel = 1.0 - smoothstep(0.0, 1.2, abs(d));
  // Inside the plate the paper was pressed flat and kept a whisper of plate tone.
  return bevel * lit * 0.06 - step(0.0, d) * 0.025;
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

  var col = sheet.rgb * (1.0 + plateMark(px));

  // Hand colour, a little off the engraved line as a colourist's brush was.
  let slip = (vec2<f32>(vnoise(p * 0.018 + 3.0), vnoise(p * 0.018 + 9.0)) - 0.5) * 0.012;
  let glowSlip = glowAt(uv + slip);
  let glowL = luma(glowSlip);
  // Dutch outline colour: a band 22 units wide inside each glow's boundary, a
  // darker rim where the wash pooled as it dried, and only a pale wash beyond.
  let inside = (glowL - 0.13) / max(fwidth(glowL), 1e-5);
  let band = step(0.0, inside) * (1.0 - smoothstep(0.0, 22.0 * u.unit, inside));
  let rim = step(0.0, inside) * (1.0 - smoothstep(1.5 * u.unit, 3.5 * u.unit, inside));
  let skyWash = (band * 0.5 + rim * 0.15 + smoothstep(0.13, 0.5, glowL) * 0.12) * clamp(0.5 + chromaOf(glowSlip) * 3.0, 0.0, 1.0);
  let bodyWash = clamp(chromaOf(src) * 2.2, 0.0, 0.7);
  let washAmt = mix(skyWash, bodyWash, body) * frame.y;
  col = applyWash(col, nearestPigment(mix(glowSlip, src, body)), washAmt);

  // Ornaments: a cartouche's fill takes the plate back to bare paper beneath it.
  let ornament = ornamentLayer(px);
  col = mix(col, sheet.rgb * (1.0 + plateMark(px)), ornament.y);
  col = applyWash(col, pigmentAt(ornament.w), ornament.z * 0.6 * frame.y);

  // Sky: glyphs for stars; the smooth band as sparse stipple and, where it is
  // bright, isophote contours (the Herschel-era way of drawing a nebula).
  let lowL = luma(glowAt(uv));
  // Levels at 0.13, 0.26, 0.52…: one boundary line, then one per doubling.
  let iso = log2(max(lowL, 1e-4) / 0.13);
  let isoPx = abs(fract(iso + 0.5) - 0.5) / max(fwidth(iso), 1e-4);
  let contour = (1.0 - smoothstep(0.35 * u.unit, 0.35 * u.unit + 1.0, isoPx)) * smoothstep(0.1, 0.13, lowL) * 0.7;
  let dots = stipple(p, 2.2, smoothstep(0.1, 0.7, lowL) * 0.3);
  let star = starInk(px);
  let clear = 1.0 - star.y;
  let skyInk = max(star.x, max(dots, contour) * clear) * sky;
  let rulings = graticule(viewRay(uv), u.unit) * sky * clear;

  // Bodies: land hatched by darkness, oceans paper by day with the Dutch hatched
  // halo along the coast, the night side crossed throughout; one firm limb line.
  let l = luma(src);
  // Ocean by hue, not brightness: tone-mapped seas are dark but always blue-led.
  let ocean = smoothstep(0.06, 0.22, (src.b - max(src.r, src.g * 0.92)) / max(src.b, 0.04));
  // Night by the brightest channel: a sunlit sea is dark in luma but not in blue.
  let night = 1.0 - smoothstep(0.04, 0.16, max(src.r, max(src.g, src.b)));
  let landTone = max(pow(1.0 - clamp(l * 1.8, 0.0, 1.0), 1.8), night);
  let tone = mix(landTone, night, ocean);
  let hatchInk = crossHatch(p, tone, 3.2, 0.35);
  let halo = coastHalo(p, coastNear(uv), 2.4) * ocean * (1.0 - night);
  let o = i32(round(u.unit));
  let gx = bodyCover(ip + vec2<i32>(o, 0)) - bodyCover(ip - vec2<i32>(o, 0));
  let gy = bodyCover(ip + vec2<i32>(0, o)) - bodyCover(ip - vec2<i32>(0, o));
  let limb = smoothstep(0.25, 0.7, length(vec2<f32>(gx, gy)));
  let bodyInk = max(hatchInk, halo * 0.85) * body;

  var captions = 0.0;
  if ((u.flags & FLAG_CAPTIONS) != 0u) {
    let ov = texel(overlayTex, ip);
    captions = ov.a * (0.45 + 0.55 * luma(ov.rgb / max(ov.a, 1e-3)));
  }

  let scene = max(max(bodyInk, limb), max(skyInk, rulings)) * (1.0 - ornament.y);
  let content = max(max(scene, captions), max(ornament.x, numeralInk(px)));
  var ink = max(content * frame.y, frame.x);
  // Paper tooth: the burr breaks thin lines where the sheet dips.
  ink *= 0.78 + 0.22 * smoothstep(0.2, 0.6, sheet.a);
  col *= mix(vec3<f32>(1.0), INK, ink);
  return vec4<f32>(col, 1.0);
}
