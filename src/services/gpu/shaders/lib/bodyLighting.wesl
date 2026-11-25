// lib/bodyLighting.wesl — the Lambert-plus-ambient shade of the flat planet
// ('bodies/planet/fragment.wesl', through 'litShade') and of 'texturedBody',
// which takes the two halves apart so 'composeSurfaceLight' can occlude each.
//
// 'AMBIENT' lifts the night hemisphere just off black so the silhouette never
// dissolves at the terminator; kept low so the night side still reads as night.
// Both vectors are in the body's local frame ('sunDirLocal' is CPU-rotated,
// 'utils/camera/bodyCompose/sunDirLocal.ts'), so an axial tilt needs no maths here.

const AMBIENT: f32 = 0.08;

// The direct half: sun-lit Lambert, scaled so it tops out at 1 - AMBIENT.
fn bodyDirectShade(normalLocal: vec3<f32>, sunDirLocal: vec3<f32>) -> f32 {
  return (1.0 - AMBIENT) * max(dot(normalLocal, sunDirLocal), 0.0);
}

fn litShade(normalLocal: vec3<f32>, sunDirLocal: vec3<f32>) -> f32 {
  return AMBIENT + bodyDirectShade(normalLocal, sunDirLocal);
}
