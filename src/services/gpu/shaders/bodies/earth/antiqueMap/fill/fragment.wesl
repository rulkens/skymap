// earth/antiqueMap/fill/fragment.wesl — the realm's colour code (vertex.wesl) on its near side.

import package::bodies::earth::antiqueMap::io::AntiqueMapUniforms;
import package::bodies::earth::antiqueMap::io::facing;
import package::bodies::earth::antiqueMap::fill::io::FillOut;

@group(0) @binding(0) var<uniform> u: AntiqueMapUniforms;

@fragment
fn fs(in: FillOut) -> @location(0) vec4<f32> {
  if (facing(normalize(in.local), u.camLocal) < 0.0) {
    discard;
  }
  return vec4<f32>(in.code / 255.0, 0.0, 0.0, 0.0);
}
