/**
 * Bin a Gaia BP−RP colour index into a rough spectral class for the star
 * InfoCard's "type" line.
 *
 * BP−RP is Gaia's blue-minus-red colour: bluer (hotter) stars have a *smaller*
 * BP−RP, redder (cooler) stars a *larger* one. That monotone blue→red ordering
 * is the whole contract of this function — the exact bin edges are a display
 * approximation, deliberately coarse (five bins, not the full O/B/A/F/G/K/M
 * sequence with decimal subclasses) because the card only wants to say "roughly
 * a hot blue star" or "roughly a cool red dwarf", not to reproduce a
 * spectroscopic classification the photometry can't actually support.
 *
 * The edges below are read off the empirical Gaia main-sequence colour–type
 * locus; the Sun (BP−RP ≈ 0.82) lands in G, which is the calibration anchor.
 * A table of ascending upper edges keeps the classifier a single sorted scan
 * rather than a chain of hand-ordered `if` branches that could silently fall
 * out of monotone order.
 */

// Upper BP−RP edge (exclusive) for each class, ascending blue→red. The final
// class has no upper edge — anything redder than the last threshold is M.
const CLASS_EDGES: ReadonlyArray<{ readonly maxBpRp: number; readonly label: string }> = [
  { maxBpRp: 0.0, label: 'O/B' },
  { maxBpRp: 0.6, label: 'A/F' },
  { maxBpRp: 0.95, label: 'G' },
  { maxBpRp: 1.8, label: 'K' },
];
const REDDEST_CLASS = 'M';

export function spectralClassFromBpRp(bpRp: number): string {
  for (const { maxBpRp, label } of CLASS_EDGES) {
    if (bpRp < maxBpRp) return label;
  }
  return REDDEST_CLASS;
}
