// bubblePresent/vertex.wesl — camera-facing quad vertex stage, one per
// bubble/cavity placement (io.wesl's own header). Offsets purely along
// camRight/camUp so the corner offset can never change viewDepth
// — same simplification fieldSplat/vertex.wesl relies on implicitly by
// never touching viewDepth per-corner.

import package::milkyWay::field::bubblePresent::io::VsOut;
import package::lib::billboard::quadCorner;
import package::lib::camera::ndcFromTangent;
import package::milkyWay::field::io::uniforms;

@vertex
fn vs(
  @builtin(vertex_index) vertexIndex: u32,
  @location(0) centerAndRadius: vec4<f32>,
  @location(1) kind: f32,
) -> VsOut {
  let corner = quadCorner(vertexIndex);
  let center = centerAndRadius.xyz;
  let radius = centerAndRadius.w;

  let eye = uniforms.eye.xyz;
  let camRight = uniforms.camRight.xyz;
  let camUp = uniforms.camUp.xyz;
  let camFwd = uniforms.camFwd.xyz;

  var out: VsOut;
  out.kind = kind;
  out.uv = corner;

  // camRight/camUp/camFwd are the orthonormal camera basis (io.wesl's header),
  // so offsetting along camRight/camUp can never change the view-space depth
  // (viewDepth): only viewX/viewY shift, by the corner's own radius-scaled offset. Same
  // simplification fieldSplat/vertex.wesl's vs relies on implicitly by never
  // touching viewDepth per-corner.
  let rel = center - eye;
  let viewDepth = dot(rel, camFwd);
  let viewX = dot(rel, camRight) + corner.x * radius;
  let viewY = dot(rel, camUp) + corner.y * radius;

  // Behind the camera: collapse the quad rather than let the divide below
  // scatter a degenerate corner across the screen — same guard
  // lib/splatSilhouette.wesl's splatNdc uses for the same reason.
  if (viewDepth < 1e-3) {
    out.pos = vec4<f32>(2.0, 2.0, 0.0, 1.0);
    return out;
  }
  out.pos = vec4<f32>(ndcFromTangent(vec2<f32>(viewX, viewY) / viewDepth, uniforms.frustum), 0.0, 1.0);
  return out;
}
