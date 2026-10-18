import type { HeldIntent } from './HeldIntent';
import type { UnitPoint } from './UnitPoint';

/** One recognised motion; `dx`/`dy` are unit fractions of the source's surface. */
export type Motion = {
  readonly intent: HeldIntent | 'zoom';
  readonly dx: number; // 0 for zoom
  readonly dy: number;
  readonly ratio: number; // 1 for orbit / pan
  readonly at: UnitPoint | null; // null for a pinch
  readonly held: boolean; // false for a wheel notch with no gesture open on its source
};
