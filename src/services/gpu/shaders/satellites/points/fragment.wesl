// satellites/points/fragment.wesl — a soft round dot, additive, hidden where Earth (or any
// resolved body, or sampled terrain) stands between the eye and the satellite.

import package::satellites::points::io::VSOut;
import package::lib::trailOcclusion::trailClearance;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // Before any discard: the limb ramp inside takes screen derivatives.
  let clear = trailClearance(in.relKm, in.clip.xy);
  let r2 = dot(in.corner, in.corner);
  if (r2 > 1.0) {
    discard;
  }
  let glow = exp(-4.0 * r2);
  return vec4<f32>(in.radiance * glow * clear, 1.0);
}
