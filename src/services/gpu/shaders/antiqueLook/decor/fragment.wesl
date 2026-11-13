// antiqueLook/decor/fragment.wesl — an ornament's ink, clearing and wash into the two decor
// rows (`io.wesl`), for the quad vertex.wesl placed.

import package::antiqueLook::shared::ornaments::AntiqueOrnaments;
import package::antiqueLook::shared::pigments::pigmentAt;
import package::antiqueLook::decor::io::DecorOut;
import package::antiqueLook::decor::io::DecorInk;

@group(0) @binding(1) var<uniform> orn: AntiqueOrnaments;
@group(0) @binding(2) var atlas: texture_2d<f32>;
@group(0) @binding(3) var linear: sampler;
// The lettering sheet (`buildAntiqueGlyphSheet`): a cartouche's title, ink in r.
@group(0) @binding(4) var letteringTex: texture_2d<f32>;

/** INK's transmittance (the plate's darkest stroke) and a figure's darkest coverage. */
const INK_T: f32 = 0.136;
const FIGURE_COVER: f32 = 0.9;

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
  // Only the cartouche frame is washed (flat inside its outline, the atlas's b);
  // figures and beasts print as ink on bare paper. The brush strays
  // a little off the line and pools unevenly (the plate's own wash noise).
  let stray = (vec2<f32>(sin(dot(in.local, vec2<f32>(7.3, 3.1)) + in.local.y * 11.0),
    cos(dot(in.local, vec2<f32>(-4.7, 8.9)) + in.local.x * 13.0))) * 0.003;
  let brush = textureSampleLevel(atlas, linear, uv + stray * (rect.zw - rect.xy), 0.0);
  // Pigment gathers where a wash dries, at its edge: a darker rim, no airbrush fade.
  let rim = 1.0 - abs(2.0 * brush.b - 1.0);
  // The stray only wanders inside the wash's own outline (`s.b`), never onto the paper past it.
  let flat = min(brush.b + 0.35 * rim, 1.0) * smoothstep(0.0, 0.2, s.b);
  let wash = flat * orn.items[in.item].washed * o;
  let hue = pigmentAt(orn.items[in.item].pigment);
  var out: DecorInk;
  out.ink = vec4<f32>(figure * (1.0 - clears), ink * clears, clear, wash);
  out.hue = vec4<f32>(hue * step(0.01, wash), 0.0);
  return out;
}
