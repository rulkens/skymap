// fieldSplat/fragment.wesl — primary field emission fragment (disc/arm/
// bulge). Ray coeffs + SPLAT_CUT early-out, then the four-slice dust-
// attenuated emission via dustAttenuation.wesl. No texture machinery, no
// near-fade, no quad-cap feather: this pass's header always packs
// dustDetail.y (the HII texture gate) and perf.x (the quad cap) at 0, so the
// absence of that code here is structural, matching what those knobs
// already force at runtime.

import package::milkyWay::field::fieldSplat::io::FieldSplatOut;
import package::lib::splatSilhouette::SPLAT_CUT;
import package::lib::gaussianIntegral::gaussianRayCoeffs;
import package::milkyWay::field::io::u;
import package::milkyWay::field::io::comps;
import package::milkyWay::field::dustAttenuation::componentEmission;

@fragment
fn fs(input: FieldSplatOut) -> @location(0) vec4<f32> {
  // Reconstructs the world-space ray from the interpolated NDC rather than
  // passing one down from the vertex stage: cheap and avoids an extra varying.
  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  let shift = u.params.z;
  let d = normalize(
    u.camRight.xyz * ((input.ndc.x + shift) * tanHalfFov * aspect)
      + u.camUp.xyz * (input.ndc.y * tanHalfFov)
      + u.camFwd.xyz,
  );
  let o = u.eye.xyz;

  let mDiagAmplitude = comps[4u * input.inst];
  let mOffBoundRadius = comps[4u * input.inst + 1u];
  let emissionColorTextureWeight = comps[4u * input.inst + 2u];
  let centerStarsWeight = comps[4u * input.inst + 3u];
  let po = o - centerStarsWeight.xyz;

  let coeffs = gaussianRayCoeffs(po, d, mDiagAmplitude.xyz, mOffBoundRadius.xyz);

  // q (coeffs.z) is the ray's own closest-approach squared Mahalanobis
  // distance. Exceeding SPLAT_CUT^2 means this fragment sits on a
  // fullscreen-fallback quad (splatSilhouette.wesl) at a pixel the ray
  // never actually grazes the component's support.
  if (coeffs.z > SPLAT_CUT * SPLAT_CUT) {
    return vec4<f32>(0.0);
  }

  let primaryCount = u32(u.counts.w);
  let emission = componentEmission(
    input.pos.xy,
    input.inst,
    primaryCount,
    coeffs,
    mDiagAmplitude.w,
    emissionColorTextureWeight.xyz,
  );

  // Exposure (params.w) multiplies emission only, never the attenuation
  // above: the dust column is physical, not a look knob that should
  // brighten or dim with the field's whole-frame exposure. debugView.w is
  // the combined galaxy dimming weight (io.wesl's debugView doc) — 1 with
  // every debug view off, so this multiply is a no-op at the default.
  // Alpha 0: the additive upsample folds this into HDR and the compositor
  // forces 1.0, so a quad writing coverage would swamp nothing usefully.
  return vec4<f32>(emission * u.params.w * u.debugView.w, 0.0);
}
