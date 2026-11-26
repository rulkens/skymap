/** Decimal places a step is written with (0.1 → 1, 0.05 → 2, 5 → 0). */
export function decimalsForStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const dot = String(step).indexOf('.');
  return dot === -1 ? 0 : String(step).length - dot - 1;
}
