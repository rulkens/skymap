// bodies/blackHoleLensing/vertex.wesl — fullscreen triangle per view: the
// lensed region is a solid angle around the hole that a flat billboard
// cannot cover once the camera sits inside the escape-fade radius. Each
// fragment's ray is built from the view's own frustum, so five dome faces
// and the mono canvas share one rule.

import package::lib::blackHoleLensing::BlackHoleLensingUniforms;

@group(0) @binding(0) var<uniform> uniforms: BlackHoleLensingUniforms;

struct VsOut {
  @builtin(position) clip: vec4<f32>,
  // Camera-relative ray position, unnormalised; the fragment renormalizes it.
  @location(0) posRelCamM: vec3<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> VsOut {
  // A triangle overshooting the [-1,1] clip square, covering every pixel.
  var ndc = vec2<f32>(-1.0, -1.0);
  if (vertexIndex == 1u) {
    ndc = vec2<f32>(3.0, -1.0);
  } else if (vertexIndex == 2u) {
    ndc = vec2<f32>(-1.0, 3.0);
  }

  // A constant-depth plane interpolates affinely, so this ray is exact at
  // every pixel, not just the three corners.
  let tanX = mix(uniforms.frustumTan.x, uniforms.frustumTan.y, (ndc.x + 1.0) * 0.5);
  let tanY = mix(uniforms.frustumTan.z, uniforms.frustumTan.w, (ndc.y + 1.0) * 0.5);
  // Scaled by the anchor distance to stay metres-order; the fragment
  // renormalizes it, so any positive scale is exact.
  let posRelCamM = (uniforms.viewBasis * vec3<f32>(tanX, tanY, 1.0)) * length(uniforms.anchorPosRelCamM);

  var out: VsOut;
  out.clip = vec4<f32>(ndc, 0.5, 1.0);
  out.posRelCamM = posRelCamM;
  return out;
}
