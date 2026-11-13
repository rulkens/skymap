// earth/antiqueMap/fill/vertex.wesl — each realm's ground as its colour code in the
// geography row's red channel (0 none, 1..7 a pigment + 1): the plate washes a
// band of that pigment inside the realm along its border, so neighbours carry
// different codes (the bake colours the realm graph).

import package::bodies::earth::antiqueMap::io::AntiqueMapUniforms;
import package::bodies::earth::antiqueMap::fill::io::FillOut;

@group(0) @binding(0) var<uniform> u: AntiqueMapUniforms;

@vertex
fn vs(@location(0) position: vec4<f32>) -> FillOut {
  var out: FillOut;
  out.clip = u.mvp * vec4<f32>(position.xyz, 1.0);
  out.local = position.xyz;
  out.code = position.w;
  return out;
}
