import type { MovePair } from '../../../packages/move-files/src/@types/MovePair';

/** A run's pending state: what the disk will look like once `writePlan` runs. */
export type Overlay = {
  readonly texts: Map<string, string>; // absolute path (after any move) → full text
  readonly moves: MovePair[]; // first source → final destination, absolute
  readonly deletes: Set<string>; // absolute paths gone from the layout, moved-away sources included
};
