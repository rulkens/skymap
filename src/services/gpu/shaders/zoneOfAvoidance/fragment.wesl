// zoneOfAvoidance/fragment.wesl — galactic-plane dust-band guide shading.
//
// Colour tail over the shared march in 'band.wesl' (which owns the wedge's
// whole shape): the normalized density mask scales the 'intensity' knob and
// the caller's fade, and the result paints straight into the additive HDR
// target. 'fragmentPick.wesl' is the pick tail over the same march.

import package::zoneOfAvoidance::io::Uniforms;
import package::zoneOfAvoidance::io::VsOut;
import package::zoneOfAvoidance::band::bandDensityMask;
import package::lib::fadeUniforms::applyFade;

@group(0) @binding(0) var<uniform> u: Uniforms;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  let densityMask = bandDensityMask(u, input.ndc, input.clipPos.xy);
  let alpha = applyFade(u.intensity * densityMask, u.fadeAlpha);
  if (alpha <= 0.0) {
    discard; // pure additive target — saves the blend
  }
  return vec4<f32>(u.color * alpha, alpha);
}
