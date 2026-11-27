import type { SliderDisplayed } from '../../@types/components/SliderDisplayed';
import type { TypedValueCheck } from '../../@types/input/TypedValueCheck';

/**
 * Why a typed value cannot be committed, in a few words. The range is given as plain
 * numbers in the units the box takes, not through the slider's `format`: a format can
 * carry context ("204 Mpc · 272 vox") that is wrong for a bound. Six significant digits
 * shorten computed bounds (1/60 → 0.0166667) without moving them visibly.
 */
export function typedValueReason(
  check: TypedValueCheck,
  min: number,
  max: number,
  displayed?: SliderDisplayed,
): string | undefined {
  if (check.kind === 'valid') return undefined;
  if (check.kind !== 'outOfRange') return 'Not a number';
  const [a, b] = displayed ? [displayed.fromValue(min), displayed.fromValue(max)] : [min, max];
  const shown = (n: number) => String(Number(n.toPrecision(6)));
  return `Between ${shown(Math.min(a, b))} and ${shown(Math.max(a, b))}`;
}
