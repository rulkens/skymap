/**
 * formatYears — a span of years as the voyage readouts write it: years and days below a thousand
 * years ("14 yr 110 d"), three significant figures past it ("1,270,000 yr"). Plain arithmetic,
 * never a Date: Earth's clock on these trips runs to 55 million years.
 */

import { JULIAN_YEAR_DAYS } from '../../data/time/julianYearDays';

export function formatYears(yr: number): string {
  if (yr >= 1000) return `${Number(yr.toPrecision(3)).toLocaleString('en-US')} yr`;
  const whole = Math.floor(yr);
  return `${whole} yr ${Math.floor((yr - whole) * JULIAN_YEAR_DAYS)} d`;
}
