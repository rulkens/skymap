// splat/fragment.wesl — evaluates the projected Gaussian at the pixel's offset from its centre.

import package::splat::io::VsOut;

@fragment
fn fs(i: VsOut) -> @location(0) vec4<f32> {
  let d = i.dPx;
  let power = -0.5 * (i.conic.x * d.x * d.x + 2.0 * i.conic.y * d.x * d.y + i.conic.z * d.y * d.y);
  let alpha = i.alpha * exp(power);
  if (alpha < 1.0 / 255.0) {
    discard;
  }
  // Capped below 1 so no single splat writes full coverage and terminates the
  // back-to-front chain early — Brush's own kernels cap at the same place.
  return vec4<f32>(i.color, min(alpha, 0.99));
}
