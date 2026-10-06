// Exact by definition: the metre is defined by the speed of light, the Julian year is 365.25 days.
const LIGHT_SECOND_KM = 299_792.458;
const YEAR_SEC = 365.25 * 86_400;

const STEPS: readonly (readonly [seconds: number, unit: string])[] = [
  [1, 'light-seconds'],
  [60, 'light-minutes'],
  [3600, 'light-hours'],
  [86_400, 'light-days'],
  [YEAR_SEC, 'light-years'],
  [YEAR_SEC * 1e3, 'thousand light-years'],
  [YEAR_SEC * 1e6, 'million light-years'],
  [YEAR_SEC * 1e9, 'billion light-years'],
];

/** Two significant figures, grouped: precise enough for a distance that changes as the page scrolls. */
const round2 = (value: number): string =>
  Number(value.toPrecision(2)).toLocaleString('en-GB', { maximumFractionDigits: 1 });

/**
 * A distance in the unit a reader can hold at that scale: kilometres up to
 * about one light-second, then the largest light-travel unit that gives a
 * number of at least one.
 */
export function formatScale(km: number): string {
  const seconds = km / LIGHT_SECOND_KM;
  if (seconds < 0.95) return `${round2(km)} km`;
  // 0.95 of a unit already rounds to 1.0 of it; without the margin the readout would show "60 light-seconds".
  const [size, unit] = [...STEPS].reverse().find(([step]) => seconds >= step * 0.95) ?? STEPS[0]!;
  return `${round2(seconds / size)} ${unit}`;
}
