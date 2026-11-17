const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** "2.5 × 10⁴": the mantissa to one decimal with a trailing ".0" dropped, so 1.04e4 reads "1 × 10⁴". */
export function formatScientific(n: number): string {
  // toExponential renormalises a rounded-up mantissa (9.96e3 → "1.0e+4", never "10.0e+3").
  const [mantissa, exponent] = n.toExponential(1).split('e') as [string, string];
  const power = [...String(Number(exponent))]
    .map((c) => (c === '-' ? '⁻' : SUPERSCRIPT_DIGITS[Number(c)]))
    .join('');
  return `${mantissa.replace(/\.0$/, '')} × 10${power}`;
}
