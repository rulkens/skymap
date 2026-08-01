// milkyWayField/splat.wesl — the analytic Milky Way field: one instanced
// quad PER COMPONENT, each covering its own Gaussian's screen footprint.
// Emission is additive and order-independent (no depth test, no depth
// sort), so overlapping quads sum to the mixture's true integral wherever a
// quad covers its own component's support: cost is sum of covered screen
// area rather than pixels x componentCount, which is what makes N~300+
// mixtures affordable.

import package::lib::billboard::quadCorner;
import package::lib::gaussianIntegral::gaussianRayIntegral;
import package::milkyWayField::io::u;

struct SplatOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) ndc: vec2<f32>,
  @location(1) @interpolate(flat) inst: u32,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) inst: u32) -> SplatOut {
  let corner = quadCorner(vi);
  let g1 = u.comps[4u * inst + 1u];
  let g3 = u.comps[4u * inst + 3u];
  let center = g3.xyz;
  let r = g1.w;

  let eye = u.eye.xyz;
  let camRight = u.camRight.xyz;
  let camUp = u.camUp.xyz;
  let camFwd = u.camFwd.xyz;
  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  let shift = u.params.z;

  // View-space offset of the centre: zv along the gaze, xv/yv across it.
  let rel = center - eye;
  let zv = dot(rel, camFwd);
  let xv = dot(rel, camRight);
  let yv = dot(rel, camUp);

  var out: SplatOut;
  out.inst = inst;

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
  let cut = 4.5;
  let bound = cut * r;
  // Fully behind the camera: the forward ray never gets within cut sigma of
  // the blob, so its contribution is below the truncation the cut already
  // accepts. Collapse the quad to nothing rather than falling through to the
  // fullscreen branch — from inside the disc, half the mixture is behind the
  // eye at any moment, and each one would otherwise cost a fullscreen pass.
  if (zv < -bound) {
    out.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    out.ndc = vec2<f32>(0.0, 0.0);
    return out;
  }
  // Eye inside or nearly inside the bounding sphere, or inside either
  // per-axis tangent cylinder: no silhouette exists and the honest footprint
  // is the whole screen.
  let discX = xv * xv + zv * zv - bound * bound;
  let discY = yv * yv + zv * zv - bound * bound;
  let denom = zv * zv - bound * bound;
  if (zv < 1.3 * r || denom <= 1e-6 || discX <= 0.0 || discY <= 0.0) {
    out.pos = vec4<f32>(corner, 0.0, 1.0);
    out.ndc = corner;
    return out;
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
  // fragment stage below inverts back into a ray.
  let ndcXLo = txLo / (tanHalfFov * aspect) - shift;
  let ndcXHi = txHi / (tanHalfFov * aspect) - shift;
  let ndcYLo = tyLo / tanHalfFov;
  let ndcYHi = tyHi / tanHalfFov;
  let mid = vec2<f32>(ndcXLo + ndcXHi, ndcYLo + ndcYHi) * 0.5;
  let half = vec2<f32>(ndcXHi - ndcXLo, ndcYHi - ndcYLo) * 0.5;
  let ndc = mid + corner * half;

  out.pos = vec4<f32>(ndc, 0.0, 1.0);
  out.ndc = ndc;
  return out;
}

@fragment
fn fs(input: SplatOut) -> @location(0) vec4<f32> {
  // Reconstructs the world-space ray from the interpolated NDC rather than
  // passing one down from the vertex stage: cheap (three lines) and avoids
  // an extra varying.
  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  let shift = u.params.z;
  let d = normalize(
    u.camRight.xyz * ((input.ndc.x + shift) * tanHalfFov * aspect)
      + u.camUp.xyz * (input.ndc.y * tanHalfFov)
      + u.camFwd.xyz,
  );
  let o = u.eye.xyz;

  let g0 = u.comps[4u * input.inst];
  let g1 = u.comps[4u * input.inst + 1u];
  let g2 = u.comps[4u * input.inst + 2u];
  let g3 = u.comps[4u * input.inst + 3u];
  let po = o - g3.xyz;
  let sum = g2.xyz * (g0.w * gaussianRayIntegral(po, d, g0.xyz, g1.xyz));

  // Alpha 0: the aggregate's alpha channel feeds nothing — the additive
  // upsample folds it into HDR and the compositor forces 1.0 — and a quad
  // writing coverage would swamp the sprites' own alpha for no reader's
  // benefit.
  return vec4<f32>(sum * u.params.w, 0.0);
}
