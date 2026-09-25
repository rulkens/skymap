// surfaceTile/hole.wesl -- the terrain-hole test both fragment variants share:
// is this fragment inside the host's holed mesh, where the scan replaces the
// terrain? 'textureSampleLevel' (the mask has one mip) has no uniformity
// requirement, and the sample is taken BEFORE the bounds branch either way.

fn inTerrainHole(mask: texture_2d<f32>, maskSampler: sampler, holeUv: vec2<f32>) -> bool {
  let cut = textureSampleLevel(mask, maskSampler, holeUv, 0.0).r;
  let inRect = all(holeUv >= vec2<f32>(0.0)) && all(holeUv <= vec2<f32>(1.0));
  return inRect && cut > 0.5;
}
