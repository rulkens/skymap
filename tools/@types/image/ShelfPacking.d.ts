import type { PackedRect } from './PackedRect';

/** A shelf-packed atlas: its extent and one rect per input, in input order. */
export type ShelfPacking = {
  readonly width: number;
  readonly height: number;
  readonly rects: readonly PackedRect[];
};
