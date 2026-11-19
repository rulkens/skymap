import type { OutputProjection } from './OutputProjection';

/** What the record draw reads per frame besides the records: the projection and the two pick
 *  words whose labels it whitens. */
export type LabelRecordView = {
  readonly projection: OutputProjection;
  readonly hoveredPick: number | null;
  readonly selectedPick: number | null;
};
