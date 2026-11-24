// missionTrail/fragment.wesl — soft-edged additive stroke, hidden where a
// resolved body or sampled terrain stands between the eye and the trail point.

import package::bodies::missionTrail::io::TrailUniforms;
import package::bodies::missionTrail::io::VSOut;
import package::lib::trailOcclusion::trailClearance;

@group(0) @binding(2) var<uniform> uniforms: TrailUniforms;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // Before any discard: the limb ramp inside takes screen derivatives.
  let clear = trailClearance(in.relKm, in.clip.xy);
  let stroke = 1.0 - smoothstep(0.0, 1.0, abs(in.side));
  let fromCut = length(in.relKm - uniforms.fadeRelKm) * uniforms.fadeInvKm;
  let fade = select(1.0, smoothstep(0.0, 1.0, fromCut), uniforms.fadeInvKm > 0.0);
  return vec4<f32>(uniforms.color * stroke * clear * fade * uniforms.opacity, 1.0);
}
