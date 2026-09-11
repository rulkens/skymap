// meshWireframe.wesl — the mesh's deduplicated triangle edges as a line list,
// drawn over the textured pass to show tessellation quality. Same position path
// as 'texturedMesh.wesl' so the lines land exactly on the triangles they trace
// (the pipeline depth-tests 'less-equal' and never writes depth).
// The colour goes straight to the non-sRGB swapchain, like its siblings.
// 'openEdge' is the pipeline-overridable class switch: one module, two
// pipelines, so the two edge classes cannot drift apart in anything but colour.

import package::lib::sceneCamera::SceneCamera;

@group(0) @binding(0) var<uniform> cam: SceneCamera;

override openEdge: f32 = 0.0;

@vertex
fn vs(@location(0) positionM: vec3<f32>) -> @builtin(position) vec4<f32> {
  return cam.viewProj * vec4<f32>(positionM, 1.0);
}

@fragment
fn fs() -> @location(0) vec4<f32> {
  return mix(vec4<f32>(0.55, 0.9, 1.0, 1.0), vec4<f32>(1.0, 0.45, 0.2, 1.0), openEdge);
}
