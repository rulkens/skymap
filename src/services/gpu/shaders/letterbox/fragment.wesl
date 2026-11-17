// letterbox/fragment.wesl — opaque black, written over whatever the overlays left.

@fragment
fn fs() -> @location(0) vec4<f32> {
  return vec4<f32>(0.0, 0.0, 0.0, 1.0);
}
