/** An arrow step a tenth of the value's leading decade (300 → 10, 0.785 → 0.01), so one press nudges any scale; 0 steps by 0.1. */
const ZERO_STEP = 0.1;

export function relativeStep(value: number): number {
  return value === 0 ? ZERO_STEP : 10 ** (Math.floor(Math.log10(Math.abs(value))) - 1);
}
