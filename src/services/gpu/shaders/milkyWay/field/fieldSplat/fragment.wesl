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

// armCloudRenorm/spurCloudRenorm (Task 15) — the arm-cloud/spur-cloud
// weightSum reciprocals ringReduce.wesl's csArmCloudFluxWeightSum/
// csArmSpurFluxWeightSum write, read here as read-only storage — the SAME
// "declared where it's used, not io.wesl's shared header" precedent
// dustMap/fragment.wesl's binding-14 dustRenorm sets (that file's own doc).
// Bindings 15/16: the next free numbers past io.wesl's own 0-13 and
// dustMap/fragment.wesl's 14.
@group(0) @binding(15) var<storage, read> armCloudRenorm: array<f32>;
@group(0) @binding(16) var<storage, read> spurCloudRenorm: array<f32>;

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

  let rec = comps[input.inst];
  let po = o - rec.center;

  let coeffs = gaussianRayCoeffs(po, d, rec.invCovDiagonal, rec.invCovOffDiagonal);

  // q (coeffs.z) is the ray's own closest-approach squared Mahalanobis
  // distance. Exceeding SPLAT_CUT^2 means this fragment sits on a
  // fullscreen-fallback quad (splatSilhouette.wesl) at a pixel the ray
  // never actually grazes the component's support.
  if (coeffs.z > SPLAT_CUT * SPLAT_CUT) {
    return vec4<f32>(0.0);
  }

  // Task 15's consume-time renorm — gated by which slot RANGE 'input.inst'
  // falls in, since FieldComponentRec (records.wesl) carries no provenance
  // lane of its own and this one pass draws disc/bulge/ridge-chain/arm-cloud/
  // spur-cloud components together. armCloudRange (perf.zw) and
  // spurCloudRange (counts2.x, dustCarve.w) are the two tiers' own
  // [start, end) reservations in this galaxy's emission mixture
  // (galaxyFieldMixture.ts's armCloudReservation/spurCloudReservation,
  // packFieldHeaderUniforms's own doc for why these four otherwise-spare
  // lanes carry them) — every OTHER component (disc/bulge/ridge chain,
  // extras) falls outside both and reads scale 1, a no-op multiply.
  var renormScale = 1.0;
  let armStart = u32(u.perf.z);
  let armEnd = u32(u.perf.w);
  let spurStart = u32(u.counts2.x);
  let spurEnd = u32(u.dustCarve.w);
  if (input.inst >= armStart && input.inst < armEnd) {
    renormScale = armCloudRenorm[0];
  } else if (input.inst >= spurStart && input.inst < spurEnd) {
    renormScale = spurCloudRenorm[0];
  }

  let primaryCount = u32(u.counts.w);
  let emission = componentEmission(
    input.pos.xy,
    input.inst,
    primaryCount,
    coeffs,
    rec.amplitude * renormScale,
    rec.color,
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
