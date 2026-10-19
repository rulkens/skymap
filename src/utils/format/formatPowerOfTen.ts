/** formatPowerOfTen — `x` as "m × 10ⁿ" with `sig` significant figures and a superscript exponent: "2.9 × 10⁻¹³". */

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';

export function formatPowerOfTen(x: number, sig: number): string {
  // toExponential rounds the mantissa and carries into the exponent (9.99e5 → "1.00e+6").
  const [mantissa, exponent] = x.toExponential(sig - 1).split('e') as [string, string];
  const n = Number(exponent);
  const digits = [...String(Math.abs(n))].map((d) => SUPERSCRIPT[Number(d)]).join('');
  return `${mantissa} × 10${n < 0 ? '⁻' : ''}${digits}`;
}
