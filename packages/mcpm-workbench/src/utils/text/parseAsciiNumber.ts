/**
 * parseAsciiNumber — what `Number()` reads from the ASCII bytes [start, end),
 * without making the string for a plain decimal. Exact: an integer of at most
 * 15 digits and a power of ten up to 1e22 are both exactly representable, so
 * one IEEE multiply or divide rounds the way `Number` does (Clinger's fast
 * path). Anything else (more digits, hex, `Infinity`, inner spaces, junk) goes
 * to `Number` itself.
 */
const POW10 = [
  1, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15, 1e16, 1e17,
  1e18, 1e19, 1e20, 1e21, 1e22,
];
const MAX_DIGITS = 15;
const MAX_EXPONENT_DIGITS = 4;
const ASCII = new TextDecoder('latin1');

export function parseAsciiNumber(bytes: Uint8Array, start: number, end: number): number {
  let i = start;
  let c = i < end ? bytes[i]! : -1;
  const negative = c === 45; // '-'
  if (negative || c === 43) c = ++i < end ? bytes[i]! : -1;

  let mantissa = 0; // exact while `significant` <= MAX_DIGITS
  let significant = 0;
  let digitsRead = 0;
  let exponent = 0;
  let fraction = false;
  for (; ; c = ++i < end ? bytes[i]! : -1) {
    if (c === 46 && !fraction) {
      fraction = true; // '.'
      continue;
    }
    const digit = c - 48;
    if (digit < 0 || digit > 9) break;
    digitsRead++;
    if (mantissa !== 0 || digit !== 0) significant++;
    mantissa = mantissa * 10 + digit;
    if (fraction) exponent--;
  }

  let wellFormed = digitsRead > 0;
  if (c === 101 || c === 69) {
    c = ++i < end ? bytes[i]! : -1; // past 'e' or 'E'
    const negativeExponent = c === 45;
    if (negativeExponent || c === 43) c = ++i < end ? bytes[i]! : -1;
    let value = 0;
    let exponentDigits = 0;
    for (; exponentDigits < MAX_EXPONENT_DIGITS; c = ++i < end ? bytes[i]! : -1) {
      const digit = c - 48;
      if (digit < 0 || digit > 9) break;
      value = value * 10 + digit;
      exponentDigits++;
    }
    wellFormed &&= exponentDigits > 0;
    exponent += negativeExponent ? -value : value;
  }

  if (wellFormed && i >= end && significant <= MAX_DIGITS) {
    const sign = negative ? -1 : 1;
    if (mantissa === 0) return sign * 0;
    if (exponent >= 0 && exponent <= 22) return sign * (mantissa * POW10[exponent]!);
    if (exponent < 0 && exponent >= -22) return sign * (mantissa / POW10[-exponent]!);
  }
  return Number(ASCII.decode(bytes.subarray(start, end)));
}
