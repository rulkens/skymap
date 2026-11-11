/**
 * `BMNG_MONTHS` — the twelve Blue Marble Next Generation 2004 months, January first, as the one
 * description of what NASA publishes. `BMNG_VINTAGE` picks the app's month from here, the registry's
 * `textures.nasaBmngMonthMM` rows are built from it, and the cloud bake reads the month matching its date.
 */

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const BMNG_MONTHS: readonly {
  /** Calendar month, 1 = January: what `bmngMonthKey` takes. */
  readonly month: number;
  /** `YYYYMM` stamp embedded in every BMNG filename. */
  readonly stamp: `2004${string}`;
  /** Directory the NASA collection publishes this month under. */
  readonly baseUrl: string;
  readonly label: string;
}[] = MONTH_NAMES.map((name, i) => ({
  month: i + 1,
  stamp: `2004${String(i + 1).padStart(2, '0')}`,
  baseUrl: `https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/${name.toLowerCase()}/`,
  label: `${name} 2004`,
}));
