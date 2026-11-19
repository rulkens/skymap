// labels/fragmentOccludeMask.wesl — 'fragmentOcclude.wesl' dimmed by an
// occlusion mask's coverage instead of 'foreground:0' alpha. The same scalar on
// PREMULTIPLIED rgba, weighted by the verdict the vertex stage resolved
// (vertexOccludeMask.wesl).

import package::labels::io::VsOut;
import package::labels::io::LeaderVsOut;
import package::labels::vertex::recordUniforms;
import package::labels::fragment::shadeLeader;
import package::lib::msdf::shadeMsdf;
import package::lib::occlusionMask::maskCoverage;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  let shaded = shadeMsdf(input.uv, input.fontIndex, input.color, input.outlineColor, input.outlineSdf);
  let coverage = maskCoverage(input.pos.xy, recordUniforms.out.sizePx);
  return shaded * mix(1.0, 1.0 - coverage, input.occludeWeight);
}

@fragment
fn fsLeaderOccludeMask(input: LeaderVsOut) -> @location(0) vec4<f32> {
  let coverage = maskCoverage(input.pos.xy, recordUniforms.out.sizePx);
  return shadeLeader(input) * mix(1.0, 1.0 - coverage, input.occludeWeight);
}
