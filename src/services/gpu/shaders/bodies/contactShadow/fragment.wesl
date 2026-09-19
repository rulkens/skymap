// contactShadow/fragment.wesl -- a projected box decal: reconstruct the scene
// point under this pixel from the row's own depth, take it into the box's unit
// cube, and darken by the baked contact mask. The blend multiplies the target
// by the output, so 1 leaves the ground untouched.
//
// Reversed-Z: depth 0 is the far plane AND the cleared sky, so d == 0 is
// discarded before the homogeneous divide ('p.w' is finite for any d > 0).

import package::bodies::contactShadow::io::ContactShadowUniforms;

@group(0) @binding(0) var<uniform> u: ContactShadowUniforms;
@group(0) @binding(1) var contactTexture: texture_2d<f32>;
@group(0) @binding(2) var contactSampler: sampler;
@group(0) @binding(3) var sceneDepth: texture_depth_2d;

// The mask fades out over the outer half of the box's height, so terrain that
// strays from the bake's flat plane loses the shadow softly rather than at a wall.
const FADE_START: f32 = 0.5;

@fragment
fn fs(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  let d = textureLoad(sceneDepth, vec2<i32>(fragCoord.xy), 0);
  if (d == 0.0) {
    discard;
  }
  // Framebuffer y runs down, NDC y up.
  let ndc = fragCoord.xy / vec2<f32>(textureDimensions(sceneDepth)) * vec2<f32>(2.0, -2.0) +
    vec2<f32>(-1.0, 1.0);
  let h = u.clipToBox * vec4<f32>(ndc, d, 1.0);
  let p = h.xyz / h.w;
  if (any(abs(p) > vec3<f32>(1.0))) {
    discard;
  }
  // The bake's +v is the image's BOTTOM (Blender UVs), and the upload keeps the
  // PNG's top row at texel row 0 -- hence the y flip.
  let uv = vec2<f32>(p.x, -p.y) * 0.5 + 0.5;
  // Level 0 explicitly: the discards above leave derivatives undefined here.
  let mask = textureSampleLevel(contactTexture, contactSampler, uv, 0.0).r;
  let shade = mix(1.0, mask, 1.0 - smoothstep(FADE_START, 1.0, abs(p.z)));
  return vec4<f32>(shade, shade, shade, 1.0);
}
