// lib/splatSilhouette.wesl — the per-component silhouette-quad vertex math
// shared by the analytic Milky Way field's splat passes: fieldSplat/vertex.wesl
// and hiiSplat/vertex.wesl (one quad per EMISSION component) and
// dustMap/vertex.wesl (one quad per DUST component). All draw instanced
// quads sized to a Gaussian's own screen footprint from the same camera
// basis; this is that footprint, extracted so the vertex stages cannot
// drift apart.

const SPLAT_CUT: f32 = 4.5;

// splatNdc — one corner's NDC of a component's silhouette quad.
//
//   corner      — the unit-quad corner from quadCorner(vi), in [-1,1]^2
//   xv, yv, zv  — the component centre's VIEW-space offset from the eye
//                 (across camRight, across camUp, along camFwd)
//   r           — the component's boundRadius (world-space max sigma)
//   tanHalfFov, aspect, shift — the camera's projection terms (io.wesl's
//                 params.xyz), used to map view-space tangent slopes to NDC
//   capHalfNdc  — screen-space quad cap (the quad-cap lever), io.wesl's perf.x; 0 disables
//
// capHalfNdc truncates the returned quad's own half-extent, which truncates
// the Gaussian's screen support — fragments outside the smaller quad are
// simply not shaded. Accepted for the HII tiers only (the header lane that
// carries a nonzero cap): their grain texture and the existing near-fade
// already mask a cut edge, the same argument SPLAT_CUT's own 4.5-not-3
// choice above makes. The fragment stage reconstructs its ray FROM the
// interpolated NDC position, so shrinking the quad changes only which
// pixels get shaded, not the fs. The fullscreen fallback below re-centers on
// the component's own projected centre rather than returning 'corner'
// outright, guarded by zv > 1e-4: behind that plane the centre's own
// projection is unstable (dividing by a near-zero or negative zv), and the
// near-fade already collapses the deepest of those before this is reached.
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
  capHalfNdc: f32,
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

  // Angular cull: zv < 1.3*r below only catches a component the eye is NEAR in
  // depth. A component far off-axis at any zv (everything the camera just flew
  // past, at a disc-plane pose) slips past that test and falls all the way to
  // 'return corner' — a fullscreen quad for something no frustum ray comes
  // within SPLAT_CUT sigma of. Test whether the eye-to-bound-sphere tangent cone
  // (half-angle thetaC) can intersect the frustum's own cone (half-angle
  // halfDiag) at all; skip when the eye is inside the bound sphere (dist2 <=
  // bound^2), where discX/discY below are already <= 0 (xv^2+zv^2 <= bound^2 -
  // yv^2 <= bound^2, same for Y) and force the honest fullscreen return anyway.
  let dist2 = xv * xv + yv * yv + zv * zv;
  let boundSq = bound * bound;
  if (dist2 > boundSq) {
    let distEye = sqrt(dist2);
    let sinThetaC = bound / distEye; // < 1: dist2 > boundSq => distEye > bound.
    let cosThetaC = sqrt(max(0.0, 1.0 - sinThetaC * sinThetaC));
    let cosA = zv / distEye; // signed: negative when the centre trails the eye.

    // Diagonal frustum half-tangent. The fs's own ray reconstruction (this
    // file's callers) is d = camRight*(ndc.x+shift)*tanHalfFov*aspect +
    // camUp*ndc.y*tanHalfFov + camFwd — so shift re-centres the x tangent
    // range to [(shift-1), (shift+1)]*tanHalfFov*aspect over ndc.x in [-1,1];
    // its farthest-from-axis edge is tanHalfFov*aspect*(1+|shift|), which is
    // what tanHalfX below bounds (a widening, not the tighter true half-width,
    // so the cone we test against is never narrower than the real frustum's).
    let tanHalfX = tanHalfFov * aspect * (1.0 + abs(shift));
    let tanHalfDiag = sqrt(tanHalfX * tanHalfX + tanHalfFov * tanHalfFov);
    let cosHalfDiag = 1.0 / sqrt(1.0 + tanHalfDiag * tanHalfDiag);
    let sinHalfDiag = tanHalfDiag * cosHalfDiag;

    // Cull iff angle(centerDir, camFwd) > halfDiag + thetaC, i.e.
    // cosA < cos(halfDiag + thetaC), expanded by the angle-sum identity so no
    // acos/asin is needed. Continuous through zv < 0 (cosA negative, "beside or
    // behind the depth plane"): the fully-behind case (zv < -bound) already
    // returned above, so only the "beside" half reaches here, and the identity
    // holds for any angle in [0, pi] without a separate branch.
    // Conservative: a culled sphere's ENTIRE tangent cone misses the frustum's
    // entire cone, so no frustum ray comes within SPLAT_CUT sigma of it —
    // its true contribution is already below the truncation SPLAT_CUT accepts
    // everywhere else, so dropping it is image-identical, not an approximation.
    if (cosA < cosHalfDiag * cosThetaC - sinHalfDiag * sinThetaC) {
      return vec2<f32>(2.0, 2.0);
    }
  }

  if (zv < 1.3 * r || denom <= 1e-6 || discX <= 0.0 || discY <= 0.0) {
    if (capHalfNdc > 0.0 && zv > 1e-4) {
      let ndcC = vec2<f32>(xv / zv / (tanHalfFov * aspect) - shift, yv / zv / tanHalfFov);
      return ndcC + corner * capHalfNdc;
    }
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
  var half = vec2<f32>(ndcXHi - ndcXLo, ndcYHi - ndcYLo) * 0.5;
  if (capHalfNdc > 0.0) {
    half = min(half, vec2<f32>(capHalfNdc, capHalfNdc));
  }
  return mid + corner * half;
}
