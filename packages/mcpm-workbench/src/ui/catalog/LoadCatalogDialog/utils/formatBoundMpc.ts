/**
 * formatBoundMpc — a bound for the load dialog's x/y/z table: always one
 * decimal, so right-aligned values line up on the point, and a real minus
 * sign (U+2212), as wide as a digit, so it reads as a number.
 */
export function formatBoundMpc(valueMpc: number): string {
  const text = valueMpc.toFixed(1);
  return Number(text) === 0 ? '0.0' : text.replace('-', '−');
}
