// texturedMesh/vertex.wesl — projects the MVS mesh and carries its uv and
// mesh-local XY to the fragment stage's mask test.

import package::lib::sceneCamera::SceneCamera;
import package::texturedMesh::io::VsOut;

@group(0) @binding(0) var<uniform> cam: SceneCamera;

@vertex
fn vs(@location(0) positionM: vec3<f32>, @location(1) uv: vec2<f32>) -> VsOut {
  var out: VsOut;
  out.pos = cam.viewProj * vec4<f32>(positionM, 1.0);
  out.uv = uv;
  out.localXY = positionM.xy; // the vertex buffer is already mesh-local
  return out;
}
