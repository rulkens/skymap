// antiqueLook/paperBake.wesl — the sheet, baked once per resize: albedo with
// toning and foxing in rgb, the fibre relief in alpha. Screen-locked by design.

import package::antiqueLook::io::AntiqueUniforms;
import package::antiqueLook::io::VSOut;
import package::antiqueLook::paper::paperColor;
import package::antiqueLook::paper::paperRelief;

@group(0) @binding(0) var<uniform> u: AntiqueUniforms;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let p = in.pos.xy / u.unit;
  return vec4<f32>(paperColor(in.uv, p, u.seed), paperRelief(p, u.seed));
}
