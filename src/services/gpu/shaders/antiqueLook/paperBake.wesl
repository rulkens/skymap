// antiqueLook/paperBake.wesl — the sheet, baked once per resize (and again when
// the paper assets land): albedo with toning and foxing in rgb, relief in alpha.
// Screen-locked by design. With the assets, the sheet is real 1687 laid paper
// (tools/antique/paper/) at 1 texel per half print unit; until then, procedural.

import package::antiqueLook::io::AntiqueUniforms;
import package::antiqueLook::io::VSOut;
import package::antiqueLook::paper::paperColor;
import package::antiqueLook::paper::paperRelief;

@group(0) @binding(0) var<uniform> u: AntiqueUniforms;
@group(0) @binding(1) var tileTex: texture_2d<f32>;
@group(0) @binding(2) var stainTex: texture_2d<f32>;
@group(0) @binding(3) var repeatSamp: sampler;

const FLAG_PAPER: u32 = 4u;
const TONED: vec3<f32> = vec3<f32>(0.78, 0.64, 0.45);
const FOX: vec3<f32> = vec3<f32>(0.6, 0.42, 0.27);
const TIDE: vec3<f32> = vec3<f32>(0.7, 0.56, 0.4);
const TEXEL_UNITS: f32 = 0.5;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let p = in.pos.xy / u.unit;
  // Sampled unconditionally (uniformity); the flag decides which sheet is used.
  let tile = textureSampleLevel(tileTex, repeatSamp, p / (TEXEL_UNITS * f32(textureDimensions(tileTex).x)) + vec2<f32>(0.37, 0.61), 0.0);
  let stain = textureSampleLevel(stainTex, repeatSamp, in.uv, 0.0);
  if ((u.flags & FLAG_PAPER) == 0u) {
    return vec4<f32>(paperColor(in.uv, p, u.seed), paperRelief(p, u.seed));
  }
  // The scan's margin is pinned to sRGB (243, 226, 204); a plate sits a shade darker.
  var col = tile.rgb * 0.95;
  col = mix(col, TONED, stain.r * 0.6);
  // Foxing gathers where damp got in — the edges — and is rare mid-sheet.
  let edge = min(min(in.uv.x, 1.0 - in.uv.x), min(in.uv.y, 1.0 - in.uv.y));
  col = mix(col, FOX, stain.g * 0.45 * mix(1.0, 0.25, smoothstep(0.03, 0.18, edge)));
  col = mix(col, TIDE, stain.b * 0.45);
  return vec4<f32>(col, tile.a);
}
