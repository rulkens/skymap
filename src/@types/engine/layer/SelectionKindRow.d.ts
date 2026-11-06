import type { PickResult } from '../../data/PickResult';
import type { SelectionRefBase } from '../selection/SelectionRefBase';
import type { SelectionRowBase } from '../selection/SelectionRowBase';

/**
 * D5's row: one `SelectionKindRow` per ref `type`, composed by
 * `composeSelectionRows` into the one `SelectionResolver`. `pickSources` are pick
 * codes from `LayerCoreDeps.pickCode`, not entry types (Ruling 2) — disjoint across rows, asserted at boot.
 */
export type SelectionKindRow<Ref extends SelectionRefBase = SelectionRefBase> = {
  readonly type: Ref['type'];
  readonly pickSources: readonly number[];
  resolvePick(pick: PickResult): Ref | null;
  /** The inverse of `resolvePick`: the packed word this row's geometry stamps for `ref`, or null when it has none or cannot be resolved right now. */
  encodePick(ref: Ref): number | null;
  /** A driving arm fills `driver` (`DrivenSelectionRow`): the arm owns its camera-host geometry. */
  extractRow(ref: Ref, simDays: number): SelectionRowBase | null;
  readonly focusId?: {
    /** Exact knowledge: a prefix, a literal, or a loaded set. Never a catch-all. */
    claims(id: string): boolean;
    /** A claiming row is authoritative even when this returns null. */
    decode(id: string): Ref | null;
    encode(ref: Ref): string | null;
  };
};
