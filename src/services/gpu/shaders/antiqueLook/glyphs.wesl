// antiqueLook/glyphs.wesl — the star glyphs, SCATTERED: one instanced quad per
// 'antique-print-points' texel, collapsed in the vertex stage unless the texel
// holds a catalogue star (printPoint.wesl). A gather in the plate (25 cells per
// pixel) cost ~2 ms at 2800×1800; this touches only the pixels a glyph covers.
// Max-blended into `antique-star-ink`: r = glyph ink, g = its paper knock-out (1.3× radius).

import package::antiqueLook::io::AntiqueUniforms;
import package::antiqueLook::cover::coverOf;
import package::lib::math::rot2;
import package::lib::util::hash21Hq;

@group(0) @binding(0) var pointTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> u: AntiqueUniforms;
// foreground:0's colour or depth (`cover.wesl`), or a 1×1 empty texture on a frame without bodies.
@group(0) @binding(2) var bodyTex: texture_2d<f32>;

struct GlyphOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) @interpolate(flat) centre: vec2<f32>,
  // x: ray length (device px), y: rays, w: turn (radians).
  @location(1) @interpolate(flat) shape: vec4<f32>,
}

// A star glyph centred at the origin, `r` its ray length (device px): a disc
// for the faint, else a solid core half the reach with `rays` straight wedges
// tapering to points, alternate ones short from 8 up (Bode). Wedges, not a
// lobed outline: a cos^n lobe thinned below a pixel, so every star read as its core.
fn starGlyph(q: vec2<f32>, r: f32, rays: f32) -> f32 {
  let d = length(q);
  if (rays <= 0.0) {
    return 1.0 - smoothstep(r - 0.45, r + 0.45, d);
  }
  let core = 0.5 * r;
  let sector = 6.2831853 / rays;
  let turns = (atan2(q.y, q.x) + 1.5707963) / sector;
  let k = round(turns);
  let phi = abs(turns - k) * sector;
  let along = d * cos(phi);
  let across = d * sin(phi);
  let short = rays >= 8.0 && (i32(k) & 1) == 1;
  let tip = select(r, core + 0.55 * (r - core), short);
  let halfWidth = 0.7 * core * clamp((tip - along) / (tip - 0.5 * core), 0.0, 1.0);
  let wedge = 1.0 - smoothstep(halfWidth - 0.4, halfWidth + 0.4, across);
  return max(1.0 - smoothstep(core - 0.45, core + 0.45, d), wedge * step(0.0, along));
}

// A dot's radius in print units, faintest to brightest: a star's under the faintest
// glyph's; a galaxy's wider, so a cloud of bright members stands out of the field.
const STAR_DOT_RADIUS = vec2<f32>(0.45, 0.9);
const GALAXY_DOT_RADIUS = vec2<f32>(0.4, 1.6);

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> GlyphOut {
  var o: GlyphOut;
  o.pos = vec4<f32>(2.0, 2.0, 0.0, 1.0);
  let dims = vec2<u32>(textureDimensions(pointTex));
  let cell = vec2<u32>(ii % dims.x, ii / dims.x);
  if (cell.y >= dims.y) {
    return o;
  }
  let s = textureLoad(pointTex, vec2<i32>(cell), 0);
  if (s.w < 0.5) {
    return o;
  }
  let centre = vec2<f32>(s.x * 0.5 + 0.5, 0.5 - s.y * 0.5) * u.res;
  // A star behind a body never prints: its point was drawn without the body's depth.
  let bodyDims = vec2<i32>(textureDimensions(bodyTex));
  if (coverOf(textureLoad(bodyTex, min(vec2<i32>(centre), bodyDims - 1), 0), u.flags) > 0.5) {
    return o;
  }
  // Seven classes by apparent magnitude, one per whole magnitude as Hevelius
  // and Flamsteed graded theirs: dots for the faintest three (m 5, 4, 3), then
  // 6, 8 and 8 rays, and 8 long with 8 short for Sirius and Canopus. A rayed
  // star's core (half its reach) outgrows the largest dot, so every step reads.
  let radii = array<f32, 7>(1.0, 1.5, 2.1, 4.4, 5.4, 6.6, 8.0);
  let rayCounts = array<f32, 7>(0.0, 0.0, 0.0, 6.0, 8.0, 8.0, 16.0);
  let rank = 5 - clamp(i32(round(s.z)), -1, 5);
  // Each star punched by hand: its own turn, and a slight unevenness of size.
  // A dot (printPoint.wesl: w 2 a galaxy, 3 a faint star) swells with its weight, off the ladder.
  let isDot = s.w > 1.5;
  let dotRadius = select(GALAXY_DOT_RADIUS, STAR_DOT_RADIUS, s.w > 2.5);
  let size = select(radii[rank], mix(dotRadius.x, dotRadius.y, s.z * s.z), isDot);
  let r = size * u.unit * (0.92 + 0.16 * hash21Hq(floor(centre) + 7.1));
  let rays = select(rayCounts[rank], 0.0, isDot);
  let reach = 1.5 * r + 2.0;
  let corner = vec2<f32>(f32(vi & 1u), f32((vi >> 1u) & 1u)) * 2.0 - 1.0;
  let px = centre + corner * reach;
  o.pos = vec4<f32>(px.x / u.res.x * 2.0 - 1.0, 1.0 - px.y / u.res.y * 2.0, 0.0, 1.0);
  o.centre = centre;
  o.shape = vec4<f32>(r, rays, 0.0, hash21Hq(floor(centre)) * 6.2831853);
  return o;
}

@fragment
fn fs(in: GlyphOut) -> @location(0) vec4<f32> {
  let q = rot2(in.pos.xy - in.centre, in.shape.w);
  let r = in.shape.x;
  let ink = starGlyph(q, r, in.shape.y);
  let knock = 1.0 - smoothstep(1.3 * r, 1.3 * r + 1.0, length(q));
  return vec4<f32>(ink, knock, 0.0, 0.0);
}
