// lidarPoint/vertex.wesl — one screen-facing quad per LiDAR point, opaque, depth-tested.

import package::lib::sceneCamera::SceneCamera;
import package::lidarPoint::io::VsOut;

@group(0) @binding(0) var<uniform> cam: SceneCamera;

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @location(0) positionM: vec3<f32>,
  @location(1) colorAndClass: vec4<f32>,
) -> VsOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1., -1.), vec2<f32>(1., -1.), vec2<f32>(-1., 1.),
    vec2<f32>(-1., 1.), vec2<f32>(1., -1.), vec2<f32>(1., 1.),
  );
  let corner = corners[vi];

  // A quad 'pointSizePx' pixels wide needs a world half-extent of
  // 0.5 * pointSizePx * metresPerPx * w: 'metresPerPx' is 2*tan(fovY/2)/viewportH
  // (metres per pixel PER METRE of depth) and the clip 'w' is the depth the
  // perspective divide will use, so an edge-of-screen point comes out the same
  // size as a central one. 'eyeM' is in the layout for the later passes (falloff,
  // sorting); sizing from 'w' means this shader never reads it.
  let centre = cam.viewProj * vec4<f32>(positionM, 1.0);
  let halfM = 0.5 * cam.pointSizePx * cam.metresPerPx * max(centre.w, 0.0);
  let offsetM = (cam.rightM * corner.x + cam.upM * corner.y) * halfM;

  var out: VsOut;
  out.pos = cam.viewProj * vec4<f32>(positionM + offsetM, 1.0);
  out.color = colorAndClass.rgb;
  return out;
}
