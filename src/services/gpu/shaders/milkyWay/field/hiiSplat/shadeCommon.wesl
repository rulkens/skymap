// hiiSplat/shadeCommon.wesl — fragment-stage helpers shared by every HII
// fragment (youngFragment, erosionFragment, extrasFragment): ray
// reconstruction + the SPLAT_CUT early-out + the base dust-attenuated
// emission (baseHiiShading), the near-camera fade recompute (hiiNearFade),
// the quad-cap edge feather (quadCapFeather) and the shared exposure/debug-
// view tail (hiiExposureMultiply). Each fragment file multiplies
// baseHiiShading's emission by its own texture-modulation term before
// calling the last two.

import package::milkyWay::field::hiiSplat::io::HiiSplatOut;
import package::lib::splatSilhouette::SPLAT_CUT;
import package::lib::gaussianIntegral::gaussianRayCoeffs;
import package::milkyWay::field::io::u;
import package::milkyWay::field::io::comps;
import package::milkyWay::field::dustAttenuation::componentEmission;

// Feather start, in quad-corner units ([-1,1] per axis) — where the
// capped-quad edge fade begins. Only bites when u.perf.x (the HII quad-cap
// lever) is live and actually truncated a component's gaussian mid-gradient.
const QUAD_FEATHER_START: f32 = 0.7;

// HiiComponentShading — everything a fragment file needs, computed once:
// the ray coeffs, the base (dust-attenuated, not yet texture-modulated)
// emission, this component's own comps rows, and the ray origin/direction/
// near-vector every texture-modulation term re-derives its own sample point
// from (cheap to recompute, avoids a varying).
struct HiiComponentShading {
  coeffs: vec3<f32>,
  emission: vec3<f32>,
  emissionColorTextureWeight: vec4<f32>,
  centerStarsWeight: vec4<f32>,
  boundRadius: f32,
  po: vec3<f32>,
  rayOrigin: vec3<f32>,
  rayDir: vec3<f32>,
  cut: bool,
}

// baseHiiShading — ray reconstruction, the SPLAT_CUT early-out and the base
// dust-attenuated emission every HII fragment starts from. Callers must
// return vec4(0) without evaluating anything else when '.cut' is true.
fn baseHiiShading(input: HiiSplatOut) -> HiiComponentShading {
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

  var result: HiiComponentShading;
  result.coeffs = coeffs;
  // HiiComponentShading's own two fields stay vec4 — youngFragment.wesl/
  // erosionFragment.wesl/extrasFragment.wesl (outside this task's scope)
  // still read '.w' off them for textureWeight/starsWeight.
  result.emissionColorTextureWeight = vec4<f32>(rec.color, rec.textureWeight);
  result.centerStarsWeight = vec4<f32>(rec.center, rec.starsWeight);
  result.boundRadius = rec.boundRadius;
  result.po = po;
  result.rayOrigin = o;
  result.rayDir = d;
  result.cut = coeffs.z > SPLAT_CUT * SPLAT_CUT;
  if (result.cut) {
    result.emission = vec3<f32>(0.0);
    return result;
  }

  let primaryCount = u32(u.counts.w);
  result.emission = componentEmission(
    input.pos.xy,
    input.inst,
    primaryCount,
    coeffs,
    rec.amplitude,
    rec.color,
  );
  return result;
}

// hiiNearFadeActive — the fade window's own GUARD: start <= end or start <=
// 0 disables the fade. Shared by vertex.wesl's vs (which must skip clipping
// a component the eye is still approaching) and hiiNearFade below (which
// recomputes the smoothstep once the fragment stage is reached), so the two
// can't drift onto different definitions of "is the fade active".
fn hiiNearFadeActive(fadeStart: f32, fadeEnd: f32) -> bool {
  return fadeStart > fadeEnd && fadeStart > 0.0;
}

// hiiNearFade — recomputes the vs's own fade gate from 'po'/'boundRadius'
// rather than carrying it down as a varying: both are already in scope for
// the ray math above, and the vs's own gate already collapsed the fade <= 0
// case to zero fragments, so only the 0..1 band ever reaches this.
fn hiiNearFade(po: vec3<f32>, boundRadius: f32) -> f32 {
  let fadeStart = u.youngStars.z;
  let fadeEnd = u.youngStars.w;
  if (hiiNearFadeActive(fadeStart, fadeEnd)) {
    return smoothstep(fadeEnd * boundRadius, fadeStart * boundRadius, length(po));
  }
  return 1.0;
}

// quadCapFeather — the capped-quad edge fade (the quad-cap lever). For a quad the cap did
// NOT shrink (u.perf.x == 0), the edge sits at SPLAT_CUT sigma where the
// gaussian is already ~4e-5, so this feather is invisible there — it only
// bites where the cap truncated the gradient mid-slope.
fn quadCapFeather(corner: vec2<f32>) -> f32 {
  if (u.perf.x > 0.0) {
    return 1.0 - smoothstep(QUAD_FEATHER_START, 1.0, max(abs(corner.x), abs(corner.y)));
  }
  return 1.0;
}

// hiiExposureMultiply — the shared tail every HII fragment applies to its
// own emission*texMod*fade*feather: exposure (never the attenuation above,
// which is physical) times the combined debug-view dimming weight
// (io.wesl's debugView.w doc).
fn hiiExposureMultiply(emission: vec3<f32>) -> vec3<f32> {
  return emission * u.params.w * u.debugView.w;
}
