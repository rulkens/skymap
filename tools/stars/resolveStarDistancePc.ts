/**
 * resolveStarDistancePc — pick the best available distance for one Gaia star,
 * in parsecs, from the sources the build pipeline joins onto each row.
 *
 * WHY PHOTOGEOMETRIC IS THE COMMUNITY DEFAULT
 * Gaia measures a parallax, and naively inverting it (d = 1/parallax) blows
 * up for faint, distant, or noisy-parallax stars — the inversion is biased
 * and its errors are wildly asymmetric. Bailer-Jones et al. (2021) instead
 * infer a distance posterior per star, seeded by a direction-dependent prior
 * over the galaxy's stellar density. The "geometric" (`r_med_geo`) estimate
 * uses parallax + that prior; the "photogeometric" (`r_med_photogeo`)
 * estimate additionally folds in the star's colour and apparent magnitude,
 * tightening the posterior for the (extremely common) case where the star's
 * photometry is informative about its likely absolute magnitude and hence
 * its plausible distance. Photogeometric is more precise whenever colour and
 * magnitude are both available and not weird (e.g. not a blended source), so
 * it is the field's default — used first here.
 *
 * WHY GEOMETRIC IS THE FALLBACK
 * A star can lack a usable photogeometric estimate (missing or unreliable
 * BP/RP photometry, colour outside the training range) while still having a
 * geometric one, since geometric only needs the parallax + sky position.
 * Falling back to geometric recovers those rows instead of dropping them.
 *
 * WHY GCNS BACKSTOPS THE NEAREST STARS
 * The Gaia Catalogue of Nearby Stars (GCNS, Gaia DR3 Team 2021) is a
 * dedicated, independently vetted distance catalog for the ~331k stars
 * within ~100 pc — precisely the regime where Bailer-Jones' galaxy-density
 * prior is least appropriate (the prior is built for the whole Milky Way,
 * not the local solar neighbourhood) and where getting the distance right
 * matters most for a *local* star map. It is checked last only because it
 * covers far fewer stars than the Bailer-Jones catalog, not because it is
 * lower quality — for the stars it covers, it is the more trustworthy value,
 * but a per-row join only fills `gcnsDistPc` for nearby stars in the first
 * place, so the priority order in practice rarely arbitrates between GCNS
 * and a present Bailer-Jones value for the same row.
 *
 * WHY NULL IS A DROP, NOT A ZERO
 * A star with no distance from any of the three sources cannot be placed in
 * the 3D scene — there is no reprojection that recovers a position from a
 * bare RA/Dec. Substituting 0 pc would silently pin the star to the Sun's
 * position, corrupting the scene instead of omitting a star from it. The
 * caller counts and logs these nulls as drops (see the build pipeline); this
 * function only resolves the value, it does not decide what to do with an
 * absent one.
 */
export type StarDistanceInputs = {
  rMedPhotogeo: number | null; // Bailer-Jones photogeometric (community default)
  rMedGeo: number | null; // Bailer-Jones geometric fallback
  gcnsDistPc: number | null; // GCNS vetted distance (parsecs)
};

export function resolveStarDistancePc(d: StarDistanceInputs): number | null {
  if (d.rMedPhotogeo !== null) return d.rMedPhotogeo;
  if (d.rMedGeo !== null) return d.rMedGeo;
  if (d.gcnsDistPc !== null) return d.gcnsDistPc;
  return null;
}
