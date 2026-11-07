// earth/antiqueMap/fill.wesl — each realm's ground as its colour code in the
// geography row's red channel (0 none, 1..7 a pigment + 1): the plate washes a
// band of that pigment inside the realm along its border, so neighbours carry
// different codes (the bake colours the realm graph).

import package::bodies::earth::antiqueMap::io::AntiqueMapUniforms;
import package::bodies::earth::antiqueMap::io::facing;

@group(0) @binding(0) var<uniform> u: AntiqueMapUniforms;

struct FillOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) local: vec3<f32>,
  @location(1) @interpolate(flat) code: f32,
}

@vertex
fn vs(@location(0) position: vec4<f32>) -> FillOut {
  var out: FillOut;
  out.clip = u.mvp * vec4<f32>(position.xyz, 1.0);
  out.local = position.xyz;
  out.code = position.w;
  return out;
}

@fragment
fn fs(in: FillOut) -> @location(0) vec4<f32> {
  if (facing(normalize(in.local), u.camLocal) < 0.0) {
    discard;
  }
  return vec4<f32>(in.code / 255.0, 0.0, 0.0, 0.0);
}
