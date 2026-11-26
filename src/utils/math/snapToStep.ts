import { decimalsForStep } from './decimalsForStep';

/** Snap to the step grid measured from `min`, strip binary-float dust, then clamp into range. */
export function snapToStep(raw: number, min: number, max: number, step: number): number {
  const snapped = parseFloat(
    (min + Math.round((raw - min) / step) * step).toFixed(decimalsForStep(step)),
  );
  // Clamp last: rounding to the step's decimals can carry a clamped max past itself (9.5 → 10).
  return Math.min(max, Math.max(min, snapped));
}
