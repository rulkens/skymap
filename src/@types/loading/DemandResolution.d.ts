import type { EntryBand } from '../engine/layer/EntryBand';
import type { LabelEntry } from '../engine/layer/LabelEntry';
import type { VisibilityEntry } from '../engine/layer/VisibilityEntry';
import type { SelectionRefBase } from '../engine/selection/SelectionRefBase';

/** A `DeclaredDemand` resolved against the composed entries once, so a frame only reads switches. */
export type DemandResolution = {
  readonly entry: VisibilityEntry;
  /** The items whose switches count; `[undefined]` reads the entry's own switch. */
  readonly items: readonly (string | undefined)[];
  /** The label entry whose `of` is the shown address, when `labelsCount` is set. */
  readonly label: LabelEntry | undefined;
  readonly labelItems: readonly (string | undefined)[];
  /** `near`'s band, and its edge in Mpc (`out[1]` or `in[0]`). */
  readonly band: EntryBand | undefined;
  readonly edgeMpc: number;
  readonly selects: readonly SelectionRefBase['type'][] | undefined;
};
