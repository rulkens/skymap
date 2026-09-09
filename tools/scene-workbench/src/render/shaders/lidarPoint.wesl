// lidarPoint.wesl — one screen-facing quad per LiDAR point, opaque, depth-tested.
// Each instance is a points.bin record verbatim (stride 16); the ASPRS class in
// '.w' rides along to hold that stride and is unread here.
//
// A quad 'pointSizePx' pixels wide needs a world half-extent of
// 0.5 * pointSizePx * metresPerPx * w: 'metresPerPx' is 2*tan(fovY/2)/viewportH
// (metres per pixel PER METRE of depth) and the clip 'w' is the depth the
// perspective divide will use, so an edge-of-screen point comes out the same
// size as a central one. 'eyeM' is in the layout for the later passes (falloff,
// sorting); sizing from 'w' means this shader never reads it.

struct SceneCamera {
  viewProj: mat4x4<f32>,
  rightM: vec3<f32>,
  pointSizePx: f32,
  upM: vec3<f32>,
  viewportH: f32,
  eyeM: vec3<f32>,
  metresPerPx: f32,
};

@group(0) @binding(0) var<uniform> cam: SceneCamera;

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) color: vec3<f32>,
};

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

  let centre = cam.viewProj * vec4<f32>(positionM, 1.0);
  let halfM = 0.5 * cam.pointSizePx * cam.metresPerPx * max(centre.w, 0.0);
  let offsetM = (cam.rightM * corner.x + cam.upM * corner.y) * halfM;

  var out: VsOut;
  out.pos = cam.viewProj * vec4<f32>(positionM + offsetM, 1.0);
  out.color = colorAndClass.rgb;
  return out;
}

@fragment
fn fs(i: VsOut) -> @location(0) vec4<f32> {
  return vec4<f32>(i.color, 1.0);
}
