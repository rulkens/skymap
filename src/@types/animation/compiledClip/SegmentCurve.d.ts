import type { Ease } from '../Ease';

/**
 * SegmentCurve — how a base segment's progress runs from 0 to 1 over its window.
 * `'hermite'` comes only from a matched join (`resolveSeqJoins`): `m0`/`m1` are
 * d progress / d u at its ends, relative to the segment's own span, so they hold
 * inside a frame leg.
 */
export type SegmentCurve =
  | { readonly kind: 'ease'; readonly ease: Ease }
  | { readonly kind: 'hermite'; readonly m0: number; readonly m1: number };
