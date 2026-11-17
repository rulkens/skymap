// lib/fresnel.wesl — the additive Fresnel rim shared by the shell shaders.
//
// The max(0) clamp is load-bearing: head-on, rounding can push |dot(normal, viewDir)| just past
// 1, the pow base goes negative and returns NaN, and bloom smears that pixel
// into a black block.

fn fresnelRim(normal: vec3<f32>, viewDir: vec3<f32>, power: f32) -> f32 {
  return pow(max(0.0, 1.0 - abs(dot(normal, viewDir))), power);
}
