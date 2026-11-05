// atmosphere/aerialPerspective/froxelSlices.wesl — the ONE slice<->distance
// mapping of the aerial froxel volume, shared by 'bake.wesl' and 'fragment.wesl'.
// A second copy is an off-by-one-slice fog seam only an eye-check would catch.

import package::lib::math::saturate;

fn froxelSliceStartKm(i: u32, sliceKm: f32) -> f32 {
  return f32(i) * sliceKm;
}

struct FroxelCoord {
  w: f32,
  identityMix: f32,
};

// Texel i holds the march over [0, (i + 1) * sliceKm], so it sits at continuous
// index 'f = distanceKm / sliceKm - 1' and a linear sampler lerps between two
// slices. Past the last, 'w' clamps onto it; the apply never reads past the
// bound (it hands those pixels to the shell instead), so the clamp is only a
// guard. 'identityMix' is how much of the no-medium identity (zero in-scatter,
// unit transmittance) the caller mixes in: no texel covers below one slice.
fn froxelCoord(distanceKm: f32, sliceKm: f32, sliceCount: u32) -> FroxelCoord {
  let n = f32(sliceCount);
  let f = distanceKm / sliceKm - 1.0;
  var out: FroxelCoord;
  out.w = (clamp(f, 0.0, n - 1.0) + 0.5) / n;
  out.identityMix = 1.0 - saturate(distanceKm / sliceKm);
  return out;
}
