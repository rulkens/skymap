// The decay draw: the blend (zero, one-minus-constant) leaves dst·(1−w), so
// the colour written here is never read. Drawn once per frame below weight 1,
// so the running mean's old samples shrink before every field adds at w.

@fragment
fn fs() -> @location(0) vec4<f32> {
  return vec4<f32>(0.0);
}
