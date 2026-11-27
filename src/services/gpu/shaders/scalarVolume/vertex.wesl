// Scalar volume vertex: the unit cube (corners 0..1) through the field's model matrix and the
// camera's viewProj. The fragment rebuilds the camera ray from the interpolated worldPos.

import package::scalarVolume::io::VolumeUniforms;
import package::scalarVolume::io::VsOut;

@group(0) @binding(0) var<uniform> uniforms: VolumeUniforms;

@vertex
fn vs_main(@location(0) cornerLocal: vec3<f32>) -> VsOut {
  let worldPos4 = uniforms.modelMatrix * vec4<f32>(cornerLocal, 1.0);
  var out: VsOut;
  out.clip = uniforms.cam.viewProj * worldPos4;
  out.localPos = cornerLocal;
  out.worldPos = worldPos4.xyz;
  return out;
}
