// milkyWayField/splat.wesl — the analytic Milky Way field: one instanced
// quad PER EMISSION COMPONENT, each covering its own Gaussian's screen
// footprint. Emission is additive and order-independent (no depth test, no
// depth sort), so overlapping quads sum to the mixture's true integral
// wherever a quad covers its own component's support: cost is sum of
// covered screen area rather than pixels x componentCount, which is what
// makes N~300+ mixtures affordable.
//
// Dust components live in the SAME 'comps' array, past every emission
// component (see io.wesl's layout comment), but are never drawn as quads —
// the draw call's instance count is the emission count only. Each primary
// emission fragment instead walks the dust slice itself and splits its own
// ray integral at the dust's depth centroid (see 'fs's dust branch).

import package::lib::billboard::quadCorner;
import package::lib::gaussianIntegral::gaussianRayIntegral;
import package::lib::gaussianIntegral::gaussianRayCoeffs;
import package::lib::gaussianIntegral::expHalfErfc;
import package::lib::gaussianIntegral::GAUSS_PI;
import package::milkyWayField::io::u;
import package::milkyWayField::io::comps;

struct SplatOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) ndc: vec2<f32>,
  @location(1) @interpolate(flat) inst: u32,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) inst: u32) -> SplatOut {
  let corner = quadCorner(vi);
  let g1 = comps[4u * inst + 1u];
  let g3 = comps[4u * inst + 3u];
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

  let g0 = comps[4u * input.inst];
  let g1 = comps[4u * input.inst + 1u];
  let g2 = comps[4u * input.inst + 2u];
  let g3 = comps[4u * input.inst + 3u];
  let po = o - g3.xyz;

  // counts.x is the emission count (this draw's own instance count, unused
  // here); .y/.z/.w are the dust slice's offset/count and the primary
  // galaxy's own emission count — see io.wesl's layout comment.
  let dustOffset = u32(u.counts.y);
  let dustCount = u32(u.counts.z);
  let primaryCount = u32(u.counts.w);

  var emission = vec3<f32>(0.0);
  var dustApplies = false;
  // Dust attenuates only the PRIMARY galaxy's own emission splats (index <
  // primaryCount, since the primary's components are packed first — see
  // io.wesl): an extra's dust must never darken the primary, and this gate
  // is what keeps that true without extras carrying their own dust yet.
  if (input.inst < primaryCount && dustCount > 0u) {
    // This ray's total dust column: scalarTau (grey depth, locates the
    // split point), tauRGB (per-channel, becomes the transmittance),
    // depthMoment (tau-weighted depth, the split point itself) — closed
    // forms per dust component j, same quadratic machinery as the emission
    // integral below. See the module's grill-session doc for the derivation.
    var scalarTau = 0.0;
    var tauRGB = vec3<f32>(0.0);
    var depthMoment = 0.0;
    for (var j = dustOffset; j < dustOffset + dustCount; j = j + 1u) {
      let dg0 = comps[4u * j];
      let dg1 = comps[4u * j + 1u];
      let dg2 = comps[4u * j + 2u];
      let dg3 = comps[4u * j + 3u];
      let dc = gaussianRayCoeffs(o - dg3.xyz, d, dg0.xyz, dg1.xyz);
      let da = dc.x;
      if (da < 1e-12) { continue; }
      let tauJ = dg0.w * sqrt(GAUSS_PI / (2.0 * da)) * expHalfErfc(dc.z, dc.y / sqrt(2.0 * da));
      // -b/a is this component's own closest-approach depth along the ray;
      // clamped to 0 because a component whose peak is behind the eye still
      // contributes column density in front of it.
      let tPeak = max(-dc.y / da, 0.0);
      scalarTau += tauJ;
      tauRGB += tauJ * dg2.xyz;
      depthMoment += tauJ * tPeak;
    }
    dustApplies = scalarTau > 1e-6;
    if (dustApplies) {
      let tD = max(depthMoment / scalarTau, 0.0);
      let transmittance = exp(-tauRGB);

      let ec = gaussianRayCoeffs(po, d, g0.xyz, g1.xyz);
      let ea = ec.x;
      // ea < 1e-12 (ray in this component's covariance null space) leaves
      // 'emission' at its zero default rather than falling back to the
      // plain path — 'dustApplies' is already true, and a null-space ray
      // integrates to 0 either way.
      if (ea >= 1e-12) {
        let sqrtHalfA = sqrt(2.0 * ea);
        let x0 = ec.y / sqrtHalfA;
        let x1 = (ec.y + ea * tD) / sqrtHalfA;
        let full = expHalfErfc(ec.z, x0);
        let behind = expHalfErfc(ec.z, x1);
        // full - (1-T)*behind = E(0->t_d) + T*E(t_d->infinity): t_d clamped
        // >= 0 keeps x1 >= x0, so behind <= full and this stays >= 0.
        // full/behind broadcast to vec3 explicitly: WGSL has no scalar-minus-
        // vector overload (only * and / broadcast a scalar), and this needs
        // one number PER CHANNEL once (1-T) varies by channel.
        let perChannel = vec3<f32>(full) - (vec3<f32>(1.0) - transmittance) * behind;
        emission = g2.xyz * (g0.w * sqrt(GAUSS_PI / (2.0 * ea)) * perChannel);
      }
    }
  }
  if (!dustApplies) {
    emission = g2.xyz * (g0.w * gaussianRayIntegral(po, d, g0.xyz, g1.xyz));
  }

  // Alpha 0: the aggregate's alpha channel feeds nothing — the additive
  // upsample folds it into HDR and the compositor forces 1.0 — and a quad
  // writing coverage would swamp the sprites' own alpha for no reader's
  // benefit.
  //
  // Exposure (params.w) multiplies emission only, never the attenuation
  // above: the dust column is physical (a property of the galaxy's own
  // geometry), not a look knob that should brighten or dim with the field's
  // whole-frame exposure.
  return vec4<f32>(emission * u.params.w, 0.0);
}
