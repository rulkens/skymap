// Sun-elevation sines: civil twilight's end (-6°) to the Sun ~6° up.
const SUN_LOW = -0.105;
const SUN_HIGH = 0.1;

/**
 * daylightWeight — 0..1, how adapted to daylight an eye inside an atmosphere is: 1 on a
 * sunlit ground, 0 at night and in space. `columnAbove` is `scatteringColumnAbove` at the
 * eye. Scales the atmosphere's daylight exposure gain and the shell's star suppression, so
 * the sky brightens and the stars fade together.
 */
export function daylightWeight(columnAbove: number, sunUpCos: number): number {
  const t = Math.min(Math.max((sunUpCos - SUN_LOW) / (SUN_HIGH - SUN_LOW), 0), 1);
  return t * t * (3 - 2 * t) * columnAbove;
}
