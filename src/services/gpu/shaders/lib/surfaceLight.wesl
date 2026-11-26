// lib/surfaceLight.wesl — where a lit surface sums its sun and sky light: each term
// arrives lit, with its own visibility (sun dims only direct, sky only ambient).
// Emissive terms are added after. Spec: docs/superpowers/specs/2026-11-25-terrain-horizon-shadows-design.md §6.

fn composeSurfaceLight(directLit: vec3<f32>, ambientLit: vec3<f32>, sunVisibility: f32, skyVisibility: f32) -> vec3<f32> {
  return directLit * sunVisibility + ambientLit * skyVisibility;
}
