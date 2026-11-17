/**
 * Math-derivation exception (comments.md): shared HII-region truth — the age
 * gate splitting `sfEventCatalog.ts`'s events into glowing knots (young) and
 * swept dust cavities (old), the Kennicutt luminosity draw, and the
 * Strömgren radius that follows from it. Imported by both `buildHiiShellsAndYoungWithSegments.ts`
 * (emission) and `buildDustBubblePlacements.ts` (cavities) so the two tiers
 * cannot drift apart on where one event's phase ends and the next begins.
 */
/**
 * Kennicutt 1989's HII-region luminosity function dN/dL ~ L^-2, drawn over
 * four decades. The span is what produces a few 30-Doradus-class giants
 * among many dwarfs; narrowing it flattens the population into same-sized
 * dots, which is the look this tier exists to avoid.
 */
const LUMINOSITY_POWER = 2;
const LUMINOSITY_MAX = 1e4;

/** Inverse CDF of dN/dL ~ L^-a over [1, LUMINOSITY_MAX], in units of the faintest. */
function hiiLuminosity(u: number): number {
  const exp = 1 - LUMINOSITY_POWER;
  const maxPow = LUMINOSITY_MAX ** exp;
  return (u * (maxPow - 1) + 1) ** (1 / exp);
}

/**
 * One event's luminosity, from the uniform already inside `SfEvent.strength`
 * (drawn as `0.5 + rng()`). Reusing that draw rather than opening a second
 * RNG stream is what lets the emission tier and the dust-cavity tier size the
 * same event identically without either re-seeding.
 */
export function hiiLuminosityOf(event: { readonly strength: number }): number {
  return hiiLuminosity(Math.min(1, Math.max(0, event.strength - 0.5)));
}
