// starPoints/fragment.wesl — additive soft-dot fragment for the seeded famous /
// scene stars, on the survey (Gaia bin) leaf profile so equal inputs give equal
// pixels.
//
// Same rim-zeroed Gaussian dot the survey leaf paints ('fs' in
// starCatalog/fragment.wesl): the bare 'exp(-r2 * 4.0)' still holds e^-4 ~= 1.8%
// of its peak at the disc edge (r = 1), which reads as a hard-edged bright disc
// on saturated peaks, so we shift and rescale to land exactly on 0 at the rim
// while keeping the centre at 1:
//
//   g(r2) = (exp(-r2 * 4.0) - EDGE) / (1 - EDGE),   EDGE = e^-4
//
// The vertex stage's flux-derived 'intensity' is the peak amplitude, so the
// deposited scalar 'I = intensity * g' makes the dot's INTEGRATED screen
// luminance proportional to the star's apparent flux (K_GAUSS in
// lib/starPhotometry.wesl integrates THIS profile, and EDGE + starGlowProfile
// live there too, so the shape and its integral cannot drift apart). Faint
// stars deposit almost nothing while bright stars deposit a lot
// (and bloom in the HDR pipeline). 'I' can exceed 1 — that is the HDR amplitude
// the tone-map + bloom downstream compress.
//
// ## Hue-preserving knee (shared with the survey leaf)
//
// The glow paints 'tint * scalar'; under the shared per-channel tonemap a
// scalar far over the displayable range clips channels one at a time (red
// first), collapsing hue toward white. So we compress the SCALAR with the soft
// knee BEFORE the tint multiply ('starKnee', lib/starKnee.wesl — the ONE home of
// the curve, shared with the survey stages), keeping the channel ratios (the
// colour) intact at any exposure. A famous leaf therefore compresses identically
// to a survey leaf.
//
// ## The backdrop dissolve rides the tint, not an opacity uniform
//
// Unlike the survey leaf (which carries a per-node crossfade 'opacity'), the
// seeded stars' galaxy-framing backdrop dissolve is applied CPU-side by the
// layer, which pre-scales each star's uploaded 'color'. Because the pass is
// one/one additive into the depthless HDR target, scaling the tint IS a complete
// linear fade of the deposited light — so this stage needs no opacity term.
//
// ## Blend target
//
// PREMULTIPLIED output, '(rgb * a, a)', into the depthless rgba16float HDR
// accumulation with one/one additive blending (configured pipeline-side in
// starPointRenderer.ts) — byte-for-byte the survey-point convention, so
// overlapping stars brighten long-exposure style.

import package::bodies::starPoints::io::VSOut;
import package::lib::starKnee::starKnee;
import package::lib::starPhotometry::starGlowProfile;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(in.uv, in.uv);
  // Discard the billboard's corners so the dot is round.
  if (r2 > 1.0) { discard; }
  // Rim-zeroed Gaussian profile (starGlowProfile, lib/starPhotometry.wesl):
  // reaches exactly 0 at the rim (r2 = 1) so saturated peaks show no hard edge,
  // while g(0) = 1.
  let g = starGlowProfile(r2);
  let I = in.intensity * g;
  // Hue-preserving soft-knee on the SCALAR, tint applied AFTER, so the tint's
  // channel ratios survive any exposure instead of clipping toward white.
  let a = starKnee(I);
  return vec4<f32>(in.color * a, a);
}
