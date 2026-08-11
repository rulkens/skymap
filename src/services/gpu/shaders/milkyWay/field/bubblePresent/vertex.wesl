// bubblePresent/vertex.wesl — camera-facing quad vertex stage, one per
// bubble/cavity placement (io.wesl's own header). Offsets purely along
// camRight/camUp so the corner offset can never change view-space depth zv
// — same simplification fieldSplat/vertex.wesl relies on implicitly by
// never touching zv per-corner.

import package::milkyWay::field::bubblePresent::io::VsOut;
import package::lib::billboard::quadCorner;
import package::milkyWay::field::io::u;

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @location(0) centerAndRadius: vec4<f32>,
  @location(1) kind: f32,
) -> VsOut {
  let corner = quadCorner(vi);
  let center = centerAndRadius.xyz;
  let r = centerAndRadius.w;

  let eye = u.eye.xyz;
  let camRight = u.camRight.xyz;
  let camUp = u.camUp.xyz;
  let camFwd = u.camFwd.xyz;
  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  let shift = u.params.z;

  var out: VsOut;
  out.kind = kind;
  out.uv = corner;

  // camRight/camUp/camFwd are the orthonormal camera basis (the view
  // matrix's own rows — see io.wesl's header), so offsetting along
  // camRight/camUp can never change the view-space depth zv: only xv/yv
  // shift, by the corner's own radius-scaled offset. Same simplification
  // fieldSplat/vertex.wesl's vs relies on implicitly by never touching zv per-corner.
  let rel = center - eye;
  let zv = dot(rel, camFwd);
  let xv = dot(rel, camRight) + corner.x * r;
  let yv = dot(rel, camUp) + corner.y * r;

  // Behind the camera: collapse the quad rather than let the divide below
  // scatter a degenerate corner across the screen — same guard
  // lib/splatSilhouette.wesl's splatNdc uses for the same reason.
  if (zv < 1e-3) {
    out.pos = vec4<f32>(2.0, 2.0, 0.0, 1.0);
    return out;
  }
  let ndcX = xv / zv / (tanHalfFov * aspect) - shift;
  let ndcY = yv / zv / tanHalfFov;
  out.pos = vec4<f32>(ndcX, ndcY, 0.0, 1.0);
  return out;
}
