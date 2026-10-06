/** A number at two significant figures, grouped the British way: the precision of the site's live lines. */
export function twoFigures(value: number): string {
  // The default formatter stops at three decimals, which would print 0.0042 as 0.004.
  return Number(value.toPrecision(2)).toLocaleString('en-GB', { maximumSignificantDigits: 2 });
}
