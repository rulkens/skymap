import type { Ease } from '../Ease';

/** SegmentCurve — how a base segment's progress runs from 0 to 1 over its window. */
export type SegmentCurve = { readonly kind: 'ease'; readonly ease: Ease };
