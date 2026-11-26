/**
 * formatAsteroidDiameter — `digits` significant figures, in metres below 1 km so a 480 m rock does not
 * read "0.480 km". The unit is chosen after rounding, so 0.9996 km reads "1.00 km", not "1,000 m".
 */
export function formatAsteroidDiameter(km: number, digits: number): string {
  const rounded = Number(km.toPrecision(digits));
  const [value, unit] = rounded < 1 ? [km * 1000, 'm'] : [km, 'km'];
  const shown = Number(value.toPrecision(digits));
  // toPrecision turns 1234 into "1.23e+3"; past `digits` integer places, plain rounding reads better.
  const text = shown >= 10 ** digits ? shown.toLocaleString('en-US') : value.toPrecision(digits);
  return `${text} ${unit}`;
}
