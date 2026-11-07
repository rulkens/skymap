// antiqueLook/glyphs.wesl — the star glyphs, SCATTERED: one instanced quad per
// quarter-res cell, collapsed in the vertex stage unless the cell holds a
// suppressed peak. A gather in the plate (25 cells per pixel) cost ~2 ms at
// 2800×1800; this touches only the pixels a glyph covers. Max-blended into
// `antique-star-ink`: r = glyph ink, g = its paper knock-out (1.3× radius).

import package::antiqueLook::io::AntiqueUniforms;
import package::antiqueLook::engraving::starGlyph;
import package::lib::math::rot2;
import package::lib::util::hash21Hq;

@group(0) @binding(0) var starTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> u: AntiqueUniforms;

// Star contrast below this prints nothing: the paper floor (about naked-eye depth).
const STAR_FLOOR: f32 = 0.58;

struct GlyphOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) @interpolate(flat) centre: vec2<f32>,
  // x: ray length (device px), y: rays, z: glory, w: turn (radians).
  @location(1) @interpolate(flat) shape: vec4<f32>,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> GlyphOut {
  var o: GlyphOut;
  o.pos = vec4<f32>(2.0, 2.0, 0.0, 1.0);
  let dims = vec2<u32>(textureDimensions(starTex));
  let cell = vec2<u32>(ii % dims.x, ii / dims.x);
  if (cell.y >= dims.y) {
    return o;
  }
  let s = textureLoad(starTex, vec2<i32>(cell), 0);
  if (s.z < STAR_FLOOR) {
    return o;
  }
  // Six classes of the Bayer/Flamsteed ladder by the light a star spreads: dots
  // for the faintest two, then 6, 6 and 8 rays, and 8 long with 8 short for the
  // brightest (a ring of ticks round a star read as a modern marker).
  let radii = array<f32, 6>(0.8, 1.4, 2.6, 3.6, 5.2, 10.0);
  let rayCounts = array<f32, 6>(0.0, 0.0, 6.0, 6.0, 8.0, 16.0);
  let k = clamp((s.w - 0.07) / 0.85, 0.0, 1.0);
  let rank = min(i32(k * 6.0), 5);
  // Each star punched by hand: its own turn, and a slight unevenness of size.
  let r = radii[rank] * u.unit * (0.92 + 0.16 * hash21Hq(floor(s.xy) + 7.1));
  let rays = select(0.0, rayCounts[rank], r >= 3.0);
  let glory = 0.0;
  let reach = 1.5 * r + 2.0;
  let corner = vec2<f32>(f32(vi & 1u), f32((vi >> 1u) & 1u)) * 2.0 - 1.0;
  let px = s.xy + corner * reach;
  o.pos = vec4<f32>(px.x / u.res.x * 2.0 - 1.0, 1.0 - px.y / u.res.y * 2.0, 0.0, 1.0);
  o.centre = s.xy;
  o.shape = vec4<f32>(r, rays, glory, hash21Hq(floor(s.xy)) * 6.2831853);
  return o;
}

@fragment
fn fs(in: GlyphOut) -> @location(0) vec4<f32> {
  let q = rot2(in.pos.xy - in.centre, in.shape.w);
  let r = in.shape.x;
  let ink = starGlyph(q, r, in.shape.y, in.shape.z);
  let knock = 1.0 - smoothstep(1.3 * r, 1.3 * r + 1.0, length(q));
  return vec4<f32>(ink, knock, 0.0, 0.0);
}
