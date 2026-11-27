// lib/meshShadow.wesl — the one read of meshBodyRenderer's sun shadow array, shared by the mesh
// fragment (a body shadowing itself) and the surface tiles (a site body's shadow on the ground),
// so rover and ground agree texel for texel. A layer's clip is orthographic over the caster's
// bounding sphere: xy in [-1, 1], depth 0..1 from the sunward pole (not reversed-Z).
//
// Ground casters' byte layout (uniform address space), packed by 'packMeshShadowCasters.ts':
//   offset   0..255: lightFromEye (array<mat4x4<f32>, 4> -- 'MESH_SHADOW_GROUND_CASTERS')
//   offset 256..271: slots        (vec4<i32> -- each caster's layer)
//   offset 272..275: count        (i32 -- casters in use; 0 skips the loop)
//   offset 276..287: struct padding to a 16-byte multiple

struct MeshShadowCasters {
  lightFromEye: array<mat4x4<f32>, 4>,
  slots: vec4<i32>,
  count: i32,
};

// Sun visibility 0..1 at 'lightClip' in layer 'slot': four bilinear compares one texel apart.
// Outside the box or nearer than the near plane reads lit; past the far plane clamps to 1,
// so a long low-sun shadow still falls on ground beyond the sphere. 'Level' compares carry no
// uniformity requirement, so the early return is safe.
fn meshShadowVisibility(
  shadowMap: texture_depth_2d_array,
  shadowSampler: sampler_comparison,
  slot: i32,
  lightClip: vec3<f32>,
) -> f32 {
  if (lightClip.z < 0.0 || abs(lightClip.x) > 1.0 || abs(lightClip.y) > 1.0) {
    return 1.0;
  }
  // Clip y is up, texture v is down.
  let uv = vec2<f32>(lightClip.x, -lightClip.y) * 0.5 + 0.5;
  let depth = min(lightClip.z, 1.0);
  let texel = 1.0 / f32(textureDimensions(shadowMap).x);
  let lit =
    textureSampleCompareLevel(shadowMap, shadowSampler, uv + vec2<f32>(-texel, -texel), slot, depth) +
    textureSampleCompareLevel(shadowMap, shadowSampler, uv + vec2<f32>(texel, -texel), slot, depth) +
    textureSampleCompareLevel(shadowMap, shadowSampler, uv + vec2<f32>(-texel, texel), slot, depth) +
    textureSampleCompareLevel(shadowMap, shadowSampler, uv + vec2<f32>(texel, texel), slot, depth);
  return lit * 0.25;
}
