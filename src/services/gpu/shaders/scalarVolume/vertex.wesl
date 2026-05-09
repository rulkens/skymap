// src/services/gpu/shaders/scalarVolume/vertex.wesl
//
// Vertex stage for the scalar volume renderer.  Draws a unit cube
// (corners at 0..1) transformed by the per-field model matrix and the
// shared camera viewProj.  The fragment shader will reconstruct the
// world-space ray and intersect with the cube's local AABB.
//
// We pass the local-space position through to the fragment shader
// (interpolated across the back-face surface) so the fragment shader
// has a starting point to compute the camera-to-fragment ray direction
// -- and a known surface point on the cube boundary, useful for
// validating the AABB intersection (a fragment on the back face must
// have the entry point either behind it on the ray, or at t=0 if the
// camera is inside).

import package::lib::camera::CameraUniforms;

struct VolumeUniforms {
  cam: CameraUniforms,            // 80 bytes (shared prefix)
  modelMatrix: mat4x4<f32>,       //   64 bytes -- local cube -> world space
  invModelMatrix: mat4x4<f32>,    //   64 bytes -- world -> local cube space
  cameraPosWorld: vec3<f32>,      //   12 bytes -- for ray origin
  intensity: f32,                 //    4 bytes -- per-field slider [0,1]
};

@group(0) @binding(0) var<uniform> u: VolumeUniforms;

struct VsOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) localPos: vec3<f32>,        // unit-cube local coords (0..1)
  @location(1) worldPos: vec3<f32>,        // world-space position of this back-face fragment
};

@vertex
fn vs_main(@location(0) cornerLocal: vec3<f32>) -> VsOut {
  let worldPos4 = u.modelMatrix * vec4<f32>(cornerLocal, 1.0);
  var out: VsOut;
  out.clip = u.cam.viewProj * worldPos4;
  out.localPos = cornerLocal;
  out.worldPos = worldPos4.xyz;
  return out;
}
