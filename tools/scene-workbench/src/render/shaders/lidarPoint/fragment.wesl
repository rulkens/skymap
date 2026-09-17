// lidarPoint/fragment.wesl — the point's colour, fully opaque.

import package::lidarPoint::io::VsOut;

@fragment
fn fs(i: VsOut) -> @location(0) vec4<f32> {
  return vec4<f32>(i.color, 1.0);
}
