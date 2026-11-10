// antiqueLook/glyphs/fragment.wesl — a star glyph's ink and paper knock-out for the
// quad the vertex stage (vertex.wesl) placed.

import package::lib::math::rot2;
import package::antiqueLook::glyphs::io::GlyphOut;
import package::antiqueLook::glyphs::io::RAY_REACH;

// A star glyph centred at the origin, `r` its size (device px): a disc for the
// faint, else a solid core r/2 with `rays` straight wedges tapering to points at
// RAY_REACH × r, alternate ones short from 8 up (Bode). Wedges, not a lobed
// outline: a cos^n lobe thinned below a pixel, so every star read as its core.
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
  let tip = select(RAY_REACH * r, core + 0.55 * (RAY_REACH * r - core), short);
  // Concave taper: a long ray stays a spike, not a fat wedge merging its neighbours at the core.
  let taper = clamp((tip - along) / (tip - 0.5 * core), 0.0, 1.0);
  let halfWidth = 0.6 * core * taper * taper;
  // Past the tip halfWidth is 0 but the AA band still half-inks the axis: cap it there.
  let cap = step(0.0, along) * (1.0 - smoothstep(tip - 0.4, tip + 0.4, along));
  let wedge = 1.0 - smoothstep(halfWidth - 0.4, halfWidth + 0.4, across);
  return max(1.0 - smoothstep(core - 0.45, core + 0.45, d), wedge * cap);
}

@fragment
fn fs(in: GlyphOut) -> @location(0) vec4<f32> {
  let q = rot2(in.pos.xy - in.centre, in.shape.w);
  let r = in.shape.x;
  let ink = starGlyph(q, r, in.shape.y);
  let knock = 1.0 - smoothstep(1.3 * r, 1.3 * r + 1.0, length(q));
  return vec4<f32>(ink, knock, 0.0, 0.0);
}
