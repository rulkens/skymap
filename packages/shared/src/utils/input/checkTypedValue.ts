import type { SliderDisplayed } from '../../@types/components/SliderDisplayed';
import type { TypedValueCheck } from '../../@types/input/TypedValueCheck';
import { parseTypedNumber } from './parseTypedNumber';

/** Reads text typed in shown units and checks it in stored ones, so `[min, max]` is the stored range. */
export function checkTypedValue(
  text: string,
  min: number,
  max: number,
  displayed?: SliderDisplayed,
): TypedValueCheck {
  const typed = parseTypedNumber(text);
  if (typed === 'incomplete') return { kind: 'incomplete' };
  if (typed === 'invalid') return { kind: 'notNumber' };
  const value = displayed ? displayed.toValue(typed) : typed;
  // A non-finite conversion (log10 of 0) fails both comparisons, so it lands out of range.
  return value >= min && value <= max ? { kind: 'valid', value } : { kind: 'outOfRange' };
}
