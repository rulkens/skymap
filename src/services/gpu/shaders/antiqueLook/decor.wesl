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
  let s = textureSampleLevel(atlas, linear, mix(rect.xy, rect.zw, in.local * 0.5 + 0.5), 0.0);
  let edge = max(abs(in.local.x), abs(in.local.y));
  let o = orn.items[in.item].opacity * (1.0 - smoothstep(0.9, 1.0, edge));
  let clears = orn.items[in.item].clears;
  // One ink with the plate: the scan's greys pushed to line or paper.
  let ink = smoothstep(0.2, 0.55, s.r) * o;
  // A clearing ornament (the cartouche) takes the plate back to paper under its
  // whole engraving, not just its fill; every ornament takes a light wash, as
  // a coloured Dutch copy's cartouche and beasts did.
  let clear = max(s.g, smoothstep(0.05, 0.3, s.r)) * o * clears;
  let wash = max(s.b, s.g * 0.28) * o;
  var out: DecorInk;
  // Constellation figures are light hatching (Hevelius), so the stars on them
  // stay readable: about 60% ink. Clearing ornaments print full.
  out.ink = vec4<f32>(ink * 0.62 * (1.0 - clears), ink * clears, clear, wash);
  out.hue = vec4<f32>(pigmentAt(orn.items[in.item].pigment) * step(0.01, wash), 0.0);
  return out;
}
