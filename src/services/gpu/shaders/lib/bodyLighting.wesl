// lib/bodyLighting.wesl — Lambert-plus-ambient shade for the flat planet ('litShade') and
// 'texturedBody' (which takes the halves apart for 'composeSurfaceLight'). Vectors are in the
// body's local frame; 'AMBIENT' lifts the night side just off black.

const AMBIENT: f32 = 0.08;

// The direct half: sun-lit Lambert, scaled so it tops out at 1 - AMBIENT.
fn bodyDirectShade(normalLocal: vec3<f32>, sunDirLocal: vec3<f32>) -> f32 {
  return (1.0 - AMBIENT) * max(dot(normalLocal, sunDirLocal), 0.0);
}

fn litShade(normalLocal: vec3<f32>, sunDirLocal: vec3<f32>) -> f32 {
  return AMBIENT + bodyDirectShade(normalLocal, sunDirLocal);
}
