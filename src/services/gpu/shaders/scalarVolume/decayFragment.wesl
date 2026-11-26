// The decay draw (see volumeFieldRenderer.ts); its blend never reads this colour.

@fragment
fn fs() -> @location(0) vec4<f32> {
  return vec4<f32>(0.0);
}
