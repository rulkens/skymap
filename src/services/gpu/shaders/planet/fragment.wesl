// planet/fragment.wesl — flat-lit albedo fragment for the planet sphere.
//
// One dot product, not a lighting system: the per-instance albedo is
// modulated by a lambert term against a FIXED light direction plus a small
// ambient floor. That is deliberately a stand-in — real sun-relative lighting
// (light direction derived from the star body's actual position relative to
// each planet) is later work; a fixed direction keeps this shader free of any
// per-frame light uniform while still making the sphere read as a lit 3-D ball
// rather than a flat disc.
//
// ## Fixed light direction
//
// 'LIGHT_DIR' points from roughly +X with a mild +Y / +Z lift, in the body's
// local frame — which equals the world equatorial J2000 frame because the body
// MVP's model half is a uniform scale + translate (no rotation), so directions
// pass through unchanged. +X-dominant is a nod to where the light SHOULD come
// from (the Sun sits sunward of every planet; the seeded solar-system bodies
// spread near the ecliptic), but the exact vector is an aesthetic pick, not
// astronomy.
//
// ## Ambient floor
//
// 'AMBIENT' (0.08) keeps the night hemisphere faintly visible so the
// silhouette never dissolves into the black background, kept low so a real
// planet's night side still reads as night.
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

import package::planet::io::VSOut;

const AMBIENT: f32 = 0.08;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // Unit-sphere local position == outward normal; re-normalise after the
  // rasteriser's perspective-correct interpolation.
  let n = normalize(in.localPos);
  let LIGHT_DIR = normalize(vec3<f32>(1.0, 0.4, 0.25));
  let lambert = max(dot(n, LIGHT_DIR), 0.0);
  let shade = AMBIENT + (1.0 - AMBIENT) * lambert;
  return vec4<f32>(in.albedo * shade, 1.0);
}
