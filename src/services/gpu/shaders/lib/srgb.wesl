// lib/srgb.wesl — the sRGB transfer function (IEC 61966-2-1), for a channel the
// sampler cannot linearise: a raw 'r8unorm' map whose byte is both a coverage
// (read as-is) and a grey sRGB colour (decoded here). Matches what an '-srgb'
// texture format does in hardware.

fn srgbToLinear(v: f32) -> f32 {
  return select(pow((v + 0.055) / 1.055, 2.4), v / 12.92, v <= 0.04045);
}
