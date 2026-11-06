import type { EntryBand } from '../engine/layer/EntryBand';
import type { LabelEntry } from '../engine/layer/LabelEntry';
import type { VisibilityEntry } from '../engine/layer/VisibilityEntry';
import type { SelectionRefBase } from '../engine/selection/SelectionRefBase';
import type { SceneBodyId } from '../scene/SceneBodyId';

/** A `DeclaredDemand` resolved against the composed entries: the switches, label, band and body it reads. */
export type DemandResolution = {
  readonly entry: VisibilityEntry;
  /** The items whose switches count; `[undefined]` reads the entry's own switch. */
  readonly items: readonly (string | undefined)[];
  /** The label entry whose `of` is the shown address, when `labelsCount` is set. */
  readonly label: LabelEntry | undefined;
  readonly labelItems: readonly (string | undefined)[];
  /** `near`'s band; undefined when the band's `items` leave out one of `items`. */
  readonly band: EntryBand | undefined;
  /** The gated edges in Mpc: `in[0]` (0 when ungated) and `out[1]` (Infinity when ungated). */
  readonly inMpc: number;
  readonly outMpc: number;
  /** `size`'s body footprint radius, metres (0 without `size`). */
  readonly sizeRadiusM: number;
  /** A surface-site `size` body's host, sized to its inner bound: the horizon a load must clear. */
  readonly siteHost: { readonly id: SceneBodyId; readonly radiusM: number } | undefined;
  readonly selects: readonly SelectionRefBase['type'][] | undefined;
};
