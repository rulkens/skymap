/**
 * solarRadiusKm — the one home for the Sun's radius in kilometres.
 *
 * Several places need "how big is a star, in km": the star maker scales each
 * seed row's `radiusSolar` by it, and (Stage 1.5) the selection-row extractor
 * and focus-framing use it as the default physical size for a field star that
 * carries no measured radius. Before this module those readers each carried
 * their own literal — the maker used `696340`, `focusFraming` used the
 * ~0.09%-drifted `6.957e5`. Folding them onto one constant removes that drift
 * (the maker's `696340` wins, so authored star radii do not move; the tiny
 * framing shift is accepted).
 *
 * Value is the IAU 2015 nominal solar radius, 696,340 km.
 *
 * Lives in `data/` beside the star bodies rather than in `utils/`: it is a
 * physical constant of the domain, not a computation.
 */
export const SOLAR_RADIUS_KM = 696340;
