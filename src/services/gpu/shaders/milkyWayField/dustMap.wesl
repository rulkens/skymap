// milkyWayField/dustMap.wesl — splats the PRIMARY galaxy's dust slice into a
// screen-space column map: one instanced quad per dust component, additively
// accumulating (tau, tau*tPeak) per pixel, at fieldTex's own divisor-matched
// resolution (see createGalaxyEngine.ts's dustMapTex declaration — NOT full
// canvas res, its readers' target rate). This is the scaling backbone a
// filament network needs (grill-session doc, N1):
// dust component count decouples from emission fragment cost the same way
// splat.wesl's own quad-per-component scheme decoupled emission from it.
//
// splat.wesl's fs reads this map with one textureLoad per primary emission
// fragment, replacing its former per-fragment dust loop. The JWST view mode
// (dustPresent.wesl) reads it too, presenting the column directly through a
// palette instead of using it to attenuate emission.
//
// Vertex geometry is splat.wesl's exact silhouette math (see
// lib/splatSilhouette.wesl) — a dust component is a Gaussian with a
// boundRadius like any emission component, so the same per-axis tangent-cone
// footprint applies unchanged.

import package::lib::billboard::quadCorner;
import package::lib::splatSilhouette::splatNdc;
import package::lib::gaussianIntegral::gaussianRayCoeffs;
import package::lib::gaussianIntegral::expHalfErfc;
import package::lib::gaussianIntegral::GAUSS_PI;
import package::milkyWayField::io::u;
import package::milkyWayField::io::comps;

struct DustMapOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) ndc: vec2<f32>,
  @location(1) @interpolate(flat) inst: u32,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) inst: u32) -> DustMapOut {
  let corner = quadCorner(vi);
  // counts.y is dustOffset (== the emission count, since dust is appended
  // last — see io.wesl's layout comment): this draw's own instance index is
  // relative to the dust slice, not 'comps' as a whole.
  let dustOffset = u32(u.counts.y);
  let base = 4u * (dustOffset + inst);
  let g1 = comps[base + 1u];
  let g3 = comps[base + 3u];
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

  var out: DustMapOut;
  out.inst = inst;
  let ndc = splatNdc(corner, xv, yv, zv, r, tanHalfFov, aspect, shift);
  out.pos = vec4<f32>(ndc, 0.0, 1.0);
  out.ndc = ndc;
  return out;
}

@fragment
fn fs(input: DustMapOut) -> @location(0) vec2<f32> {
  // Reconstructs the world-space ray from the interpolated NDC, exactly as
  // splat.wesl's fs does — the two must agree pixel-for-pixel since the map
  // is later read back at the SAME framebuffer coordinates.
  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  let shift = u.params.z;
  let d = normalize(
    u.camRight.xyz * ((input.ndc.x + shift) * tanHalfFov * aspect)
      + u.camUp.xyz * (input.ndc.y * tanHalfFov)
      + u.camFwd.xyz,
  );
  let o = u.eye.xyz;

  let dustOffset = u32(u.counts.y);
  let base = 4u * (dustOffset + input.inst);
  let dg0 = comps[base];
  let dg1 = comps[base + 1u];
  let dg3 = comps[base + 3u];
  let po = o - dg3.xyz;

  let dc = gaussianRayCoeffs(po, d, dg0.xyz, dg1.xyz);
  let a = dc.x;
  // a < 1e-12: ray in this component's covariance null space — additive
  // blend means "contribute nothing" is the correct default, not a fallback
  // path (there's no other estimate to fall back to for one instance).
  if (a < 1e-12) {
    return vec2<f32>(0.0, 0.0);
  }
  // This component's own full-ray column, same closed form splat.wesl's
  // former per-fragment loop used per dust component. amplitude (dg0.w) is
  // the component's central V-band extinction density — see io.wesl's
  // layout comment.
  let tau = dg0.w * sqrt(GAUSS_PI / (2.0 * a)) * expHalfErfc(dc.z, dc.y / sqrt(2.0 * a));
  // -b/a is this component's own closest-approach depth along the ray;
  // clamped to 0 because a component whose peak is behind the eye still
  // contributes column density in front of it. Weighting by tau (rather than
  // writing tPeak directly) is what makes the SUM of every dust component's
  // additive contribution divide back out to the tau-weighted mean depth in
  // splat.wesl's fs (green / red).
  let tPeak = max(-dc.y / a, 0.0);
  return vec2<f32>(tau, tau * tPeak);
}
