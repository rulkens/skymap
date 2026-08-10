// milkyWay/ismMap/ismMapOrientationLib.wesl — shared sigma-uniform shape and
// index wrap/clamp helpers for the GPU structure-tensor orientation chain
// (ismMapOrientationField/Tensor/TensorBlur/Coherence.wesl), so the four
// passes cannot disagree on the uniform byte layout. Grid size is NOT baked
// in here: every pass already calls textureDimensions on its own target and
// passes n through to wrapIndex/clampIndex — ismMapShear.wesl's precedent.

// sigmaDeriv (small, pre-gradient noise suppression) vs sigmaInteg (larger,
// post-tensor averaging, conventionally 2-3x sigmaDeriv) — one sigma for
// both floors coherence near 0.5 on pure noise instead of near 0.
struct IsmMapOrientationSigma {
  sigmaDeriv: f32,
  sigmaInteg: f32,
}

// Azimuth wraps; the radial (ring) axis clamps at rMin/rMax.
fn wrapIndex(i: i32, n: u32) -> u32 {
  return u32(((i % i32(n)) + i32(n)) % i32(n));
}

fn clampIndex(i: i32, n: u32) -> u32 {
  return u32(clamp(i, 0, i32(n) - 1));
}

// Unnormalised; callers sum their own taps and divide by that sum.
fn gaussianTap(k: i32, sigma: f32) -> f32 {
  let kf = f32(k);
  return exp(-(kf * kf) / (2.0 * sigma * sigma));
}

fn kernelRadius(sigma: f32) -> i32 {
  return max(1, i32(ceil(sigma * 3.0)));
}
