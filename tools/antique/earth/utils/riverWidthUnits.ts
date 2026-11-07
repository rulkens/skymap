/**
 * riverWidthUnits — a river's engraved width in print units, from its Natural
 * Earth scalerank (0 = the Amazon) and the km it has run from its source: it
 * starts at 30 % of its rank width and swells to the full width 250 km down.
 * The taper reads only km from source, so a river split into pieces at its
 * confluences stays continuous when each piece passes on its upstream km.
 */

const TAPER_KM = 250;
/** Index = scalerank; ranks past the end draw at the last entry's width. */
const RANK_UNITS = [2.0, 2.0, 1.8, 1.5, 1.3, 1.1, 1.0, 0.9, 0.9, 0.8, 0.7];

export function riverWidthUnits(scalerank: number, kmFromSource: number): number {
  const rankUnits = RANK_UNITS[Math.min(Math.max(0, scalerank), RANK_UNITS.length - 1)]!;
  return rankUnits * (0.3 + 0.7 * Math.min(1, Math.max(0, kmFromSource) / TAPER_KM) ** 0.6);
}
