// lib/splatSilhouette.wesl — the per-component silhouette-quad vertex math
// shared by the analytic Milky Way field's two splat passes: splat.wesl
// (one quad per EMISSION component) and dustMap.wesl (one quad per DUST
// component). Both draw instanced quads sized to a Gaussian's own screen
// footprint from the same camera basis; this is that footprint, extracted
// so the two vertex stages cannot drift apart.

const SPLAT_CUT: f32 = 4.5;

// splatNdc — one corner's NDC of a component's silhouette quad.
//
//   corner      — the unit-quad corner from quadCorner(vi), in [-1,1]^2
//   xv, yv, zv  — the component centre's VIEW-space offset from the eye
//                 (across camRight, across camUp, along camFwd)
//   r           — the component's boundRadius (world-space max sigma)
//   tanHalfFov, aspect, shift — the camera's projection terms (io.wesl's
//                 params.xyz), used to map view-space tangent slopes to NDC
//
// A silhouette cone only exists once the eye clears the blob's bounding
// sphere by a margin (cut sigma); inside that margin — including "behind"
// — every ray through the pixel can still graze the ellipsoid, so the
// correct footprint is the whole screen. zv < 1.3*r is the cheap,
// conceptually-named version of that same test; the cut*r check right
// below is what actually has to hold for the sqrt below to be real, and
// subsumes it (cut > 1.3).
// 4.5, not 3: the quad edge clips the Gaussian at the cut, and for the
// wide disc and halo components a 3-sigma clip truncates at a visible
// 1 percent step (the eye reads a hard edge in a smooth HDR gradient long
// before it reads the level). exp(-10.1) at 4.5 sigma is 4e-5 -- below
// anything the target can show.
fn splatNdc(
  corner: vec2<f32>,
  xv: f32,
  yv: f32,
  zv: f32,
  r: f32,
  tanHalfFov: f32,
  aspect: f32,
  shift: f32,
) -> vec2<f32> {
  let bound = SPLAT_CUT * r;
  // Fully behind the camera: the forward ray never gets within cut sigma of
  // the blob, so its contribution is below the truncation the cut already
  // accepts. Collapse the quad to nothing rather than falling through to the
  // fullscreen branch — from inside the disc, half the mixture is behind the
  // eye at any moment, and each one would otherwise cost a fullscreen pass.
  if (zv < -bound) {
    return vec2<f32>(2.0, 2.0);
  }
  // Eye inside or nearly inside the bounding sphere, or inside either
  // per-axis tangent cylinder: no silhouette exists and the honest footprint
  // is the whole screen.
  let discX = xv * xv + zv * zv - bound * bound;
  let discY = yv * yv + zv * zv - bound * bound;
  let denom = zv * zv - bound * bound;
  if (zv < 1.3 * r || denom <= 1e-6 || discX <= 0.0 || discY <= 0.0) {
    return corner;
  }

  // Exact per-axis silhouette of the bounding sphere: the two tangent lines
  // from the eye to the circle of radius bound centred (xv, zv) in the
  // x-z plane have slopes (xv*zv +- bound*sqrt(discX)) / denom, and same in
  // y-z. This replaces the on-axis approximation r/(zv*tan), which
  // under-covers off-axis blobs by up to 1/cos^2(theta) and read as the
  // field darkening toward the screen edges.
  let sX = bound * sqrt(discX);
  let sY = bound * sqrt(discY);
  let txLo = (xv * zv - sX) / denom;
  let txHi = (xv * zv + sX) / denom;
  let tyLo = (yv * zv - sY) / denom;
  let tyHi = (yv * zv + sY) / denom;

  // Tangent space -> NDC via the same tanHalfFov/aspect/shift split the
  // fragment stage inverts back into a ray.
  let ndcXLo = txLo / (tanHalfFov * aspect) - shift;
  let ndcXHi = txHi / (tanHalfFov * aspect) - shift;
  let ndcYLo = tyLo / tanHalfFov;
  let ndcYHi = tyHi / tanHalfFov;
  let mid = vec2<f32>(ndcXLo + ndcXHi, ndcYLo + ndcYHi) * 0.5;
  let half = vec2<f32>(ndcXHi - ndcXLo, ndcYHi - ndcYLo) * 0.5;
  return mid + corner * half;
}
