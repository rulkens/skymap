// stellarStreams/streaks/fragment.wesl — the streak profile: a Gaussian of radius 'shape.y' px
// round the segment ±'shape.x' px along the streak, so it stays one sprite wide however long.

import package::stellarStreams::streaks::io::VSOut;
import package::stellarStreams::streaks::io::STREAK_FALLOFF;

@fragment
fn fs(input: VSOut) -> @location(0) vec4<f32> {
  let pastSegmentPx = max(abs(input.uvPx.x) - input.shape.x, 0.0);
  let radii2 = (pastSegmentPx * pastSegmentPx + input.uvPx.y * input.uvPx.y)
    / (input.shape.y * input.shape.y);
  let profile = exp(-STREAK_FALLOFF * radii2);
  return vec4<f32>(input.colour * profile, 0.0);
}
