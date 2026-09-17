// outlineOverlay.wesl — the draft outline over the scene: its edges as a line list
// (vsEdge/fsEdge) and its corners as camera-facing square handles (vsHandle/fsHandle).
// The pipelines test depth 'always', so the ring shows whatever mesh lies above its Z.
// Handles size like lidarPoint.wesl's quads: metresPerPx times clip w is metres per pixel.
// The first corner is coloured apart because clicking it is how a ring closes.

import package::lib::sceneCamera::SceneCamera;

@group(0) @binding(0) var<uniform> cam: SceneCamera;

const HANDLE_PX: f32 = 8.0;
const EDGE_COLOUR = vec4<f32>(1.0, 0.8, 0.1, 1.0);
const HANDLE_COLOUR = vec4<f32>(1.0, 1.0, 1.0, 1.0);
const FIRST_HANDLE_COLOUR = vec4<f32>(0.2, 1.0, 0.4, 1.0);

@vertex
fn vsEdge(@location(0) positionM: vec3<f32>) -> @builtin(position) vec4<f32> {
  return cam.viewProj * vec4<f32>(positionM, 1.0);
}

@fragment
fn fsEdge() -> @location(0) vec4<f32> {
  return EDGE_COLOUR;
}

struct HandleOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) @interpolate(flat) colour: vec4<f32>,
};

@vertex
fn vsHandle(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) ii: u32,
  @location(0) cornerM: vec3<f32>,
) -> HandleOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1., -1.), vec2<f32>(1., -1.), vec2<f32>(-1., 1.),
    vec2<f32>(-1., 1.), vec2<f32>(1., -1.), vec2<f32>(1., 1.),
  );
  let corner = corners[vi];

  let centre = cam.viewProj * vec4<f32>(cornerM, 1.0);
  let halfM = 0.5 * HANDLE_PX * cam.metresPerPx * max(centre.w, 0.0);
  let offsetM = (cam.rightM * corner.x + cam.upM * corner.y) * halfM;

  var out: HandleOut;
  out.pos = cam.viewProj * vec4<f32>(cornerM + offsetM, 1.0);
  out.colour = select(HANDLE_COLOUR, FIRST_HANDLE_COLOUR, ii == 0u);
  return out;
}

@fragment
fn fsHandle(i: HandleOut) -> @location(0) vec4<f32> {
  return i.colour;
}
