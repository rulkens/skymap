import type { FontId } from '../data/FontId';
import type { LabelAlignX } from './LabelAlignX';
import type { LabelAlignY } from './LabelAlignY';

/** What `textLayoutOf` lays out: the text, its font and both alignments (all part of the cache key). */
export type TextLayoutRequest = {
  readonly text: string;
  readonly font: FontId;
  readonly alignX: LabelAlignX;
  readonly alignY: LabelAlignY;
};
