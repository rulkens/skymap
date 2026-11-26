// asteroids/points/fragment.wesl — the stars' soft dot, additive ('fs'); the same footprint as a pick
// word ('fsPick'). Occlusion by bodies is the vertex stage's, once per dot.

import package::asteroids::points::io::VSOut;
import package::asteroids::points::io::PickOut;
import package::lib::starPhotometry::starGlowProfile;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let radiusSq = dot(in.cornerKnee.xy, in.cornerKnee.xy);
  let knee = in.cornerKnee.z;
  if (radiusSq > 1.0) {
    discard;
  }
  // The stars' knee curve at a far lower ceiling: under the display lift most dots reach it, so a
  // patch reads by how many dots it holds and a sparse group shows beside the dense belt. The knee on
  // the scalar, the tint after it, as the stars do.
  let glow = knee * (1.0 - exp(-in.tint.a * starGlowProfile(radiusSq) / knee));
  return vec4<f32>(in.tint.rgb * glow, glow);
}

@fragment
fn fsPick(in: PickOut) -> @location(0) u32 {
  if (dot(in.corner, in.corner) > 1.0) {
    discard;
  }
  return in.word;
}
