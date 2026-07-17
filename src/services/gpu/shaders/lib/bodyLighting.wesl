// lib/bodyLighting.wesl — the one Lambert-plus-ambient shade term every lit
// body reads.
//
// Three fragment stages need the exact same lit-sphere maths: the flat planet
// ('bodies/planet/fragment.wesl'), the textured planet/moon
// ('bodies/texturedBody/fragment.wesl'), and Earth ('bodies/earth/fragment.wesl').
// Centralising the term here means all three read ONE definition of 'lit' — so a
// tweak to the ambient floor or the Lambert curve lands everywhere at once,
// rather than drifting between three hand-copied expressions.
//
// ## The shared ambient floor
//
// 'AMBIENT' (0.08) lifts the night hemisphere just off pure black so a body's
// silhouette never dissolves into the background at the terminator. It is kept
// deliberately low: a real planet's night side still reads as night, and the
// lit side dominates. The alternative — no floor — makes the unlit half
// vanish, which looks like a bite taken out of the sphere rather than a
// day/night terminator.
//
// ## Why a function, not an inline dot product
//
// The Lambert term is 'max(dot(n, L), 0)' — trivial on its own. Wrapping it
// with the ambient floor in a named helper is what keeps the THREE fragments
// honest: none of them re-derives 'AMBIENT + (1 - AMBIENT) * lambert' by hand,
// so the day/night balance is provably identical across the flat, textured, and
// Earth paths.
//
// Both arguments are expected in the SAME frame (the body's local frame): the
// surface normal comes from the interpolated unit-sphere local position, and
// 'sunDirLocal' is the CPU-rotated sun direction ('utils/camera/sunDirLocal.ts')
// already carried into that frame. Keeping them co-framed is what lets this stay
// a plain dot product even when a body has an axial tilt.

const AMBIENT: f32 = 0.08;

fn litShade(normalLocal: vec3<f32>, sunDirLocal: vec3<f32>) -> f32 {
  let lambert = max(dot(normalLocal, sunDirLocal), 0.0);
  return AMBIENT + (1.0 - AMBIENT) * lambert;
}
