// lib/surfaceLight.wesl — the one place a lit surface sums its sun and sky light.
//
// Every surface shader (the tile fragments, Earth, 'texturedBody') hands in its
// direct and ambient terms already lit, and its occlusion as two visibilities:
// 'sunVisibility' dims only the direct term (Saturn's ring shadow today),
// 'skyVisibility' only the ambient one. Emissive terms (night lights) are added
// after, never through here. Design: docs/superpowers/specs/2026-11-25-terrain-horizon-shadows-design.md §6.

fn composeSurfaceLight(directLit: vec3<f32>, ambientLit: vec3<f32>, sunVisibility: f32, skyVisibility: f32) -> vec3<f32> {
  return directLit * sunVisibility + ambientLit * skyVisibility;
}
