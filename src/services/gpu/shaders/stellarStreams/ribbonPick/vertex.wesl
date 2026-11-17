// stellarStreams/ribbonPick/vertex.wesl — the streams' pick: one static screen-space quad per
// centreline segment, as wide as the stream on screen and never under 'minHalfWidthPx'.
// lib/segmentQuad.wesl walks an endpoint behind the eye off-screen along the segment instead of
// extruding through w <= 0, which is what tore the old per-particle stamps into screen-crossing
// slivers.

import package::stellarStreams::ribbonPick::io::Uniforms;
import package::stellarStreams::ribbonPick::io::PickOut;
import package::lib::camera::worldToClip;
import package::lib::segmentQuad::expandSegmentQuad;

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

fn halfWidthPx(rel: vec3<f32>, halfWidthMpc: f32) -> f32 {
  return max(halfWidthMpc / max(length(rel), 1e-12) * uniforms.cam.pxPerRad, uniforms.minHalfWidthPx);
}

@vertex
fn vs(
  @builtin(vertex_index) vertexIndex: u32,
  @location(0) aWorld: vec3<f32>,
  @location(1) bWorld: vec3<f32>,
  @location(2) halfWidthMpc: f32,
  @location(3) stream: u32,
) -> PickOut {
  var out: PickOut;
  let corner = vec2<f32>(f32(vertexIndex & 1u), f32(vertexIndex >> 1u));
  let aRel = aWorld - uniforms.eye;
  let bRel = bWorld - uniforms.eye;
  let isB = corner.x > 0.5;
  // A corner behind the eye takes the front end's width: its own, metres away, would be vast.
  let ownFront = worldToClip(uniforms.cam, select(aRel, bRel, isB)).w > 0.0;
  let widthEndRel = select(aRel, bRel, select(!isB, isB, ownFront));
  let cornerHalfWidthPx = halfWidthPx(widthEndRel, halfWidthMpc);
  // A walked corner keeps the front end's depth, so a ribbon through the eye stamps a little far:
  // it can only lose a depth test it should have won, never steal a nearer pick.
  let quad = expandSegmentQuad(uniforms.cam, aRel, bRel, corner, cornerHalfWidthPx);
  // Each end overruns by its half-width, so a bend leaves no gap between segments.
  let overrunPx = quad.tangent * (corner.x * 2.0 - 1.0) * cornerHalfWidthPx;
  let overrun = overrunPx / (uniforms.cam.viewportPx * 0.5);
  out.clipPos = quad.clip + vec4<f32>(overrun * quad.clip.w, 0.0, 0.0);
  out.word = uniforms.pickBase + stream;
  return out;
}
