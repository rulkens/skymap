// planet/fragment.wesl — flat-lit albedo fragment for the planet sphere.
//
// One dot product, not a lighting system: the per-instance albedo is
// modulated by the shared sun-relative Lambert term ('lib/bodyLighting.wesl'
// 'litShade') plus its ambient floor. The sun direction is the per-instance
// 'sunDirLocal' — the Sun's direction rotated into the body's local frame on
// the CPU ('utils/camera/sunDirLocal.ts') and baked into the instance record
// — so the terminator tracks each planet's real position relative to the Sun,
// and the same 'litShade' lights the flat, textured, and Earth paths alike.
//
// ## Why the sun direction rides per-instance, not a uniform
//
// One instanced draw paints every seeded planet, so a single light uniform
// would collapse them all onto one direction (and race writeBuffer-vs-submit
// besides). Baking 'sunDirLocal' into each instance record — forwarded as a
// flat varying — gives every planet its own correct terminator from one draw.
//
// ## Ambient floor
//
// The floor lives in 'litShade' ('AMBIENT' = 0.08 in 'lib/bodyLighting.wesl'):
// it keeps the night hemisphere faintly visible so the silhouette never
// dissolves into the black background, kept low so a real planet's night side
// still reads as night.
//
// ## Albedo source / blend target
//
// The albedo arrives as a per-instance flat varying from 'planet/vertex.wesl'
// (baked into the instance vertex buffer alongside the MVP columns), NOT a
// uniform — so one instanced draw paints every planet its own colour. Output
// is straight alpha=1 into the rgba16float foreground target — the planet
// draws in the OPAQUE foreground pass (depth-tested, no blend); the foreground
// composite handles layer blending. Lit albedo stays in 0..1, comfortably
// below the star's emissive output.

import package::bodies::planet::io::VSOut;
import package::lib::bodyLighting::litShade;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // Unit-sphere local position == outward normal; re-normalise after the
  // rasteriser's perspective-correct interpolation. Both the normal and the
  // sun direction are in the body's local frame, so 'litShade' stays a plain
  // co-framed dot product.
  let n = normalize(in.localPos);
  let shade = litShade(n, in.sunDirLocal);
  return vec4<f32>(in.albedo * shade, 1.0);
}
