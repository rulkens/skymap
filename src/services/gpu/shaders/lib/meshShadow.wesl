// lib/meshShadow.wesl — the one read of meshBodyRenderer's sun shadow array, shared by the mesh
// fragment (a body shadowing itself) and the surface tiles (a site body's shadow on the ground),
// so rover and ground agree texel for texel. A layer's clip is orthographic over the caster's
// bounding sphere: xy in [-1, 1], depth 0..1 from the sunward pole (not reversed-Z).
//
// Ground casters' byte layout (uniform address space), packed by 'packMeshShadowCasters.ts':
//   offset   0..255: lightFromEye (array<mat4x4<f32>, 4> -- 'MESH_SHADOW_GROUND_CASTERS')
//   offset 256..271: slots        (vec4<i32> -- each caster's layer)
//   offset 272..275: count        (i32 -- casters in use; 0 skips the loop)
//   offset 276..279: depthBiasTexels    (f32 -- 'MeshShadowFilter', unpacked: a nested struct
//   offset 280..283: filterRadiusTexels (f32    would need 16-byte alignment in a uniform)
//   offset 284..287: filterSide         (i32)

struct MeshShadowCasters {
  lightFromEye: array<mat4x4<f32>, 4>,
  slots: vec4<i32>,
  count: i32,
  depthBiasTexels: f32,
  filterRadiusTexels: f32,
  filterSide: i32,
};

// The receiver-side knobs ('debug.meshShadowTuning'), in texels so they follow the map size.
struct MeshShadowFilter {
  depthBiasTexels: f32,
  radiusTexels: f32,
  // Compares per side of the grid (1..4); 1 is a single tap at the centre.
  side: i32,
};

// Sun visibility 0..1 at 'lightClip' in layer 'slot': a side x side grid of bilinear compares
// spanning +-radius texels. Outside the box or nearer than the near plane reads lit; past the
// far plane clamps to 1, so a long low-sun shadow still falls on ground beyond the sphere.
// 'Level' compares carry no uniformity requirement, so the early return and the loop are safe.
fn meshShadowVisibility(
  shadowMap: texture_depth_2d_array,
  shadowSampler: sampler_comparison,
  slot: i32,
  lightClip: vec3<f32>,
  pcf: MeshShadowFilter,
) -> f32 {
  if (lightClip.z < 0.0 || abs(lightClip.x) > 1.0 || abs(lightClip.y) > 1.0) {
    return 1.0;
  }
  // Clip y is up, texture v is down.
  let uv = vec2<f32>(lightClip.x, -lightClip.y) * 0.5 + 0.5;
  let texel = 1.0 / f32(textureDimensions(shadowMap).x);
  // The light box is as deep as it is wide, so a texel of depth is 'texel' in clip z.
  let depth = min(lightClip.z, 1.0) - pcf.depthBiasTexels * texel;
  let side = clamp(pcf.side, 1, 4);
  let radius = pcf.radiusTexels * texel;
  let spacing = 2.0 * radius / f32(max(side - 1, 1));
  let first = select(-radius, 0.0, side == 1);
  var lit = 0.0;
  for (var row = 0; row < side; row++) {
    for (var col = 0; col < side; col++) {
      let offset = vec2<f32>(first + f32(col) * spacing, first + f32(row) * spacing);
      lit += textureSampleCompareLevel(shadowMap, shadowSampler, uv + offset, slot, depth);
    }
  }
  return lit / f32(side * side);
}
