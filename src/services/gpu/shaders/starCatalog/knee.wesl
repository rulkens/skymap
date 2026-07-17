// starCatalog/knee.wesl — the survey-star hue-preserving soft-knee, the ONE
// home of the compression constant and curve.
//
// The star pass paints 'tint * scalar', where the tint's channel ratios carry
// the star's colour and the scalar is the flux-derived glow amplitude. Under
// the shared per-channel tonemap a glow whose scalar runs far over the
// displayable range clips its channels one at a time (red first), collapsing
// every hue toward yellow-white — so the survey's real colour structure would
// die at the DISPLAY step. The fix is to compress the SCALAR with a soft
// rolloff BEFORE the tint multiply, so the ratios (the hue) survive any
// exposure:
//
//   starKnee(I) = KNEE * (1 - exp(-I / KNEE))
//
// Linear for I << KNEE ('starKnee(I) ~= I'): the faint regime is untouched, so
// photometric invariance and flux conservation hold EXACTLY there — exactly
// where an LOD swap must stay invisible (a just-refined child and its share of
// the parent are both sub-knee and both linear, so the swap deposits the same
// light). As I grows the output saturates smoothly toward the asymptote KNEE
// instead of clipping, so a bright CORE whitens the honest way — by
// ACCUMULATION of many compressed, still-tinted glows summing past white in the
// additive target — not by per-channel clipping of a single glow.
//
// ## Why the constant lives here, alone
//
// Two stages apply this exact curve: the leaf fragment (per-glow, at deposit
// time) and the aggregate-upsample composite (on the SUMMED half-res field, so
// a stack of sub-knee aggregate quads gets compressed like a concentrated
// bright leaf does — the LOD-symmetry fix). If each copied the KNEE literal the
// two could silently drift and reintroduce the very asymmetry the split exists
// to remove, so both import this module and neither restates the number.
//
// KNEE sits comfortably above 1.0 so bloom still sees genuine HDR values and
// bright cores still bloom, yet well below the old unbounded peaks so the
// rolloff actually engages where the colour was dying. Eye-tunable via HMR.

const KNEE: f32 = 8.0;

fn starKnee(i: f32) -> f32 {
  return KNEE * (1.0 - exp(-i / KNEE));
}
