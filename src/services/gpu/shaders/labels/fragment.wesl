// labels/fragment.wesl — MSDF labels fragment stage. The shading body
// (median3 + shadeMsdf, plus the atlas bindings) lives in lib/msdf.wesl —
// shared with the scene-attenuated variant in fragmentOcclude.wesl. This
// entry just unpacks VsOut into the scalar shadeMsdf call. 'fsLeader' shades
// the leader quads with a one-pixel anti-aliased edge across their width.

import package::labels::io::VsOut;
import package::labels::io::LeaderVsOut;
import package::lib::msdf::shadeMsdf;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  return shadeMsdf(input.uv, input.fontIndex, input.color, input.outlineColor, input.outlineSdf);
}

// 'fwidth' makes the falloff band one pixel wide at any line width.
fn shadeLeader(input: LeaderVsOut) -> vec4<f32> {
  let edgeDist = abs(input.across - 0.5) * 2.0;
  let antialiasWidth = fwidth(edgeDist);
  return input.color * (1.0 - smoothstep(1.0 - antialiasWidth, 1.0, edgeDist));
}

@fragment
fn fsLeader(input: LeaderVsOut) -> @location(0) vec4<f32> {
  return shadeLeader(input);
}
