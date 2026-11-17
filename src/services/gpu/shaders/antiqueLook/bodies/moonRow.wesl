// antiqueLook/bodies/moonRow.wesl — the Moon's own row, 8 bits a channel: written by its
// pass (`texturedBody/fragment.wesl` `fsMoonPrint`), copied into the plate's `moon` layer,
// read by `moon.wesl`. Decoded: r the albedo over ~7 px (sqrt luma), g 2 + the terrain's
// light (0 = no Moon), b rim ink (+2 on a bright crater floor), a the albedo over ~24 px.
// The light is stored as a signed sqrt, so its steps are finest round 0, the terminator.

const LIGHT_MAX: f32 = 1.5;
// g's floor on the Moon: below it reads as no Moon.
const ON_MOON: f32 = 2.0 / 255.0;
// b: rim ink up to RIM_SPAN, a bright floor from 1 - RIM_SPAN up.
const RIM_SPAN: f32 = 0.49;

fn encodeMoonRow(albedo: f32, light: f32, rim: f32, brightFloor: bool, wide: f32) -> vec4<f32> {
  let signedSqrt = sign(light) * sqrt(min(abs(light), LIGHT_MAX) / LIGHT_MAX);
  let rimBlue = rim * RIM_SPAN + select(0.0, 1.0 - RIM_SPAN, brightFloor);
  return vec4<f32>(albedo, ON_MOON + (1.0 - ON_MOON) * (0.5 + 0.5 * signedSqrt), rimBlue, wide);
}

fn decodeMoonRow(texel: vec4<f32>) -> vec4<f32> {
  if (texel.g < 0.5 * ON_MOON) {
    return vec4<f32>(texel.r, 0.0, 0.0, texel.a);
  }
  let signedSqrt = ((texel.g - ON_MOON) / (1.0 - ON_MOON)) * 2.0 - 1.0;
  let bright = step(0.5, texel.b);
  return vec4<f32>(texel.r, 2.0 + sign(signedSqrt) * signedSqrt * signedSqrt * LIGHT_MAX, (texel.b - bright * (1.0 - RIM_SPAN)) / RIM_SPAN + 2.0 * bright, texel.a);
}
