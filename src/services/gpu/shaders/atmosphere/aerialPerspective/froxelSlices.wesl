// atmosphere/aerialPerspective/froxelSlices.wesl — the ONE slice<->distance
// mapping of the camera-local aerial froxel volume, shared by the bake
// ('bake.wesl', which writes texel z = i) and the apply ('fragment.wesl',
// which reads at a distance). A second copy of this arithmetic anywhere is an
// off-by-one-slice fog seam nothing but an eye-check would catch.

import package::lib::math::saturate;

// Texel z = i holds the march accumulated over [0, (i + 1) * sliceKm], so the
// first slice already covers a whole sliceKm of medium.
fn froxelSliceEndKm(i: u32, sliceKm: f32) -> f32 {
  return (f32(i) + 1.0) * sliceKm;
}

// 'w' is the normalized z to sample at; 'identityMix' is how much of the
// no-medium identity (zero in-scatter, unit transmittance) the caller must mix
// in, since the volume holds no texel for distances below one slice.
struct FroxelCoord {
  w: f32,
  identityMix: f32,
};

// Texel i sits at continuous index 'f = distanceKm / sliceKm - 1', so a linear
// sampler lerps between the two neighbouring slices. Past the last slice 'w'
// clamps onto it, and the bake put the whole ray's totals there.
fn froxelCoord(distanceKm: f32, sliceKm: f32, sliceCount: u32) -> FroxelCoord {
  let n = f32(sliceCount);
  let f = distanceKm / sliceKm - 1.0;
  var out: FroxelCoord;
  out.w = (clamp(f, 0.0, n - 1.0) + 0.5) / n;
  out.identityMix = 1.0 - saturate(distanceKm / sliceKm);
  return out;
}
