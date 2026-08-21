// mcpm/camera.wesl — the voxel-space camera the mcpm screen-space passes share, plus the
// forward projection that is the EXACT inverse of fragment.wesl's ray setup. A splat or a
// point overlay that derived its own projection would drift off the raymarch it sits over
// with nothing on screen to say which of the two moved.
//
// 'camRight'/'camUp'/'camForward' are UNIT vectors here; fragment.wesl's own TraceView
// pre-scales its copies by tan(fovY/2) (and aspect), which is why this struct carries the
// two scalars separately instead. UNITS: camVoxel in voxels, screen in pixels.

struct McpmCamera {
  camVoxel: vec3<f32>,
  tanHalfFov: f32,
  camRight: vec3<f32>,
  aspect: f32,
  camUp: vec3<f32>,
  screenWidth: f32,
  camForward: vec3<f32>,
  screenHeight: f32,
};

// Returns (ndc.x, ndc.y, depth). 'depth' is the distance along camForward and is <= 0 for
// a point at or behind the eye plane, where the two ndc lanes are meaningless: the divide
// flips their sign and folds the point back into view, so every caller must test it.
fn voxelToNdc(cam: McpmCamera, p: vec3<f32>) -> vec3<f32> {
  let v = p - cam.camVoxel;
  let depth = dot(v, cam.camForward);
  let x = dot(v, cam.camRight) / (depth * cam.tanHalfFov * cam.aspect);
  let y = dot(v, cam.camUp) / (depth * cam.tanHalfFov);
  return vec3<f32>(x, y, depth);
}
