// missionTrail/fragment.wesl — soft-edged additive stroke, hidden where a
// resolved body or sampled terrain stands between the eye and the trail point.

import package::bodies::missionTrail::io::TrailUniforms;
import package::bodies::missionTrail::io::VSOut;
import package::lib::trailOcclusion::trailClearance;

@group(0) @binding(2) var<uniform> u: TrailUniforms;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // Before any discard: the limb ramp inside takes screen derivatives.
  let clear = trailClearance(in.relKm, in.clip.xy);
  let stroke = 1.0 - smoothstep(0.0, 1.0, abs(in.side));
  return vec4<f32>(u.color * stroke * clear * u.opacity, 1.0);
}
