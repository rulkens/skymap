import type { UnitPoint } from './UnitPoint';

/**
 * The first two contacts, from the second one's landing to the release.
 * `spanPx` and `mid` are the last span and midpoint; while `pending` they stay
 * the landing's own, the reference the lock measures from.
 */
export type RecognizerPair = {
  readonly mode: 'pending' | 'pinch' | 'tilt';
  readonly spanPx: number;
  readonly mid: UnitPoint;
};
