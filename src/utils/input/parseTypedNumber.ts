import type { TypedNumber } from '../../@types/input/TypedNumber';

// Stricter than Number(), which also takes hex, "Infinity" and "" (as 0). Dot only,
// like every other number field in the app.
const COMPLETE = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const INCOMPLETE = /^[+-]?\.?$|^[+-]?(\d+\.?\d*|\.\d+)e[+-]?$/i;

export function parseTypedNumber(text: string): TypedNumber {
  const trimmed = text.trim();
  if (INCOMPLETE.test(trimmed)) return 'incomplete';
  return COMPLETE.test(trimmed) ? Number(trimmed) : 'invalid';
}
