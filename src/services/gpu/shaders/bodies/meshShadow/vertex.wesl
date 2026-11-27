// meshShadow/vertex.wesl — a mesh body's positions into its shadow layer. No fragment stage:
// the pass writes depth only, with the pipeline's slope-scaled bias.

import package::bodies::meshShadow::io::MeshShadowDepthUniforms;

@group(0) @binding(0) var<uniform> uniforms: MeshShadowDepthUniforms;

@vertex
fn vs(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> {
  return uniforms.lightFromMesh * vec4<f32>(position, 1.0);
}
