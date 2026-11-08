// antiqueLook/decor.wesl — the ornaments, SCATTERED: one instanced quad per
// placed ornament, turned and sized as `placeAntiqueOrnaments` placed it, its
// atlas rect sampled only where it lands. Max-blended into two rows the plate
// reads with one tap each (a per-pixel loop over the list cost ~0.9 ms):
//   `antique-decor`   r figure ink, g plate ink, b clear-to-paper, a wash;
//   `antique-decor-hue` rgb the wash's pigment.
// Edges fade over the outer tenth so a cropped engraving never ends square.

import package::antiqueLook::io::AntiqueUniforms;
import package::antiqueLook::ornaments::AntiqueOrnaments;
import package::antiqueLook::pigments::pigmentAt;

@group(0) @binding(0) var<uniform> u: AntiqueUniforms;
@group(0) @binding(1) var<uniform> orn: AntiqueOrnaments;
@group(0) @binding(2) var atlas: texture_2d<f32>;
@group(0) @binding(3) var linear: sampler;
// The lettering sheet (`buildAntiqueGlyphSheet`): a cartouche's title, ink in r.
@group(0) @binding(4) var letteringTex: texture_2d<f32>;

/** INK's transmittance (the plate's darkest stroke) and a figure's darkest coverage. */
const INK_T: f32 = 0.136;
const FIGURE_COVER: f32 = 0.9;
/** A figure's wash: the atlas mip its shading is read at, and the density band it ramps over. */
const FIGURE_SHADE_LOD: f32 = 3.0;
const FIGURE_SHADE: vec2<f32> = vec2<f32>(0.04, 0.4);

struct DecorOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) local: vec2<f32>,
  @location(1) @interpolate(flat) item: u32,
}

struct DecorInk {
  @location(0) ink: vec4<f32>,
  @location(1) hue: vec4<f32>,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> DecorOut {
  var o: DecorOut;
  o.pos = vec4<f32>(2.0, 2.0, 0.0, 1.0);
  o.item = ii;
  if (ii >= orn.count) {
    return o;
  }
  let local = vec2<f32>(f32(vi & 1u), f32((vi >> 1u) & 1u)) * 2.0 - 1.0;
  let rot = orn.items[ii].rot;
  let half = orn.items[ii].half;
  // The plate's inverse: screen y runs down, so a counter-clockwise turn by θ
  // sends the sprite's right to (cos θ, −sin θ) and its down to (sin θ, cos θ).
  let px = orn.items[ii].centre
    + vec2<f32>(rot.x, -rot.y) * local.x * half.x
    + vec2<f32>(rot.y, rot.x) * local.y * half.y;
  o.pos = vec4<f32>(px.x / u.res.x * 2.0 - 1.0, 1.0 - px.y / u.res.y * 2.0, 0.0, 1.0);
  o.local = local;
  return o;
}

@fragment
fn fs(in: DecorOut) -> DecorInk {
  let rect = orn.items[in.item].rect;
  let uv = mix(rect.xy, rect.zw, in.local * 0.5 + 0.5);
  // A title's ink stands in for the atlas's: it clears and inks the plate, unwashed.
  let s = select(
    textureSampleLevel(atlas, linear, uv, 0.0),
    vec4<f32>(textureSample(letteringTex, linear, uv).r, 0.0, 0.0, 0.0),
    orn.items[in.item].lettering > 0.5,
  );
  let edge = max(abs(in.local.x), abs(in.local.y));
  let o = orn.items[in.item].opacity * (1.0 - smoothstep(0.9, 1.0, edge));
  let clears = orn.items[in.item].clears;
  // One ink with the plate: the scan's greys pushed to line or paper.
  let ink = smoothstep(0.2, 0.55, s.r) * o;
  // A constellation figure prints the scan's own lines through the mip chain:
  // shrunk, a line becomes coverage, turned here into the density whose INK^d
  // matches that coverage printed. Sampled above any branch (implicit derivatives).
  let cover = textureSampleBias(atlas, linear, uv, -0.5).r;
  let figure = log2(1.0 - cover * FIGURE_COVER * (1.0 - INK_T)) / log2(INK_T) * o;
  // A clearing ornament (the cartouche) takes the plate back to paper under its
  // whole engraving, not just its fill.
  let clear = max(s.g, smoothstep(0.05, 0.3, s.r)) * o * clears;
  // Every engraving is washed flat inside its outline (the atlas's b), as a
  // coloured Dutch copy's cartouche, beasts and figures were; the brush strays
  // a little off the line and pools unevenly (the plate's own wash noise).
  let stray = (vec2<f32>(sin(dot(in.local, vec2<f32>(7.3, 3.1)) + in.local.y * 11.0),
    cos(dot(in.local, vec2<f32>(-4.7, 8.9)) + in.local.x * 13.0))) * 0.006;
  let brush = textureSampleLevel(atlas, linear, uv + stray * (rect.zw - rect.xy), 0.0);
  // Pigment gathers where a wash dries, at its edge: a darker rim, no airbrush fade.
  let rim = 1.0 - abs(2.0 * brush.b - 1.0);
  // A figure's wash follows its engraving instead (the atlas's coarse mip is the
  // local ink density): full where the engraver shaded, thinning to bare paper in
  // the lit parts and at the outline, so it never reads as a tinted cut-out.
  let shade = smoothstep(FIGURE_SHADE.x, FIGURE_SHADE.y, textureSampleLevel(atlas, linear, uv, FIGURE_SHADE_LOD).r);
  let laid = select(min(brush.b + 0.35 * rim, 1.0), brush.b * shade, clears < 0.5);
  let wash = select(laid, 0.0, orn.items[in.item].lettering > 0.5) * o;
  let hue = mix(pigmentAt(orn.items[in.item].accent), pigmentAt(orn.items[in.item].pigment), brush.a);
  var out: DecorInk;
  out.ink = vec4<f32>(figure * (1.0 - clears), ink * clears, clear, wash);
  out.hue = vec4<f32>(hue * step(0.01, wash), 0.0);
  return out;
}
