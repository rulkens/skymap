// asteroids/points/fragment.wesl — the stars' soft dot, additive ('fs'); the same footprint as a pick
// word ('fsPick'). Occlusion by bodies is the vertex stage's, once per dot.

import package::asteroids::points::io::VSOut;
import package::asteroids::points::io::PickOut;
import package::lib::starPhotometry::starGlowProfile;

// The stars' knee curve at a far lower ceiling (TS twin ASTEROID_PHOTOMETRY.dotKnee): under the
// display lift most dots reach it, so a patch reads by how many dots it holds, not by their few
// brightest, and a sparse group (Trojans, Hildas) shows beside the dense belt without it whiting out.
const DOT_KNEE: f32 = 0.2;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(in.corner, in.corner);
  if (r2 > 1.0) {
    discard;
  }
  // The knee on the scalar, the tint after it, as the stars do.
  let a = DOT_KNEE * (1.0 - exp(-in.tint.a * starGlowProfile(r2) / DOT_KNEE));
  return vec4<f32>(in.tint.rgb * a, a);
}

@fragment
fn fsPick(in: PickOut) -> @location(0) u32 {
  if (dot(in.corner, in.corner) > 1.0) {
    discard;
  }
  return in.word;
}
