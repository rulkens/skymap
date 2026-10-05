import type { SelectionRef } from '../SelectionRef';
import type { SelectionRow } from '../SelectionRow';
import type { SourceType } from '../../data/SourceType';
import type { SourceEntry } from '../../data/SourceEntry';
import type { PickResult } from '../../data/PickResult';

/**
 * D5's row: one `SelectionKindRow` per `SelectionRef['type']`, composed by
 * `composeSelectionRows` into the one `SelectionResolver`. `pickSources` are source
 * CODES, not entry types (Ruling 2) — disjoint across rows, asserted at boot.
 */
export type SelectionKindRow<Ref extends SelectionRef = SelectionRef> = {
  readonly type: Ref['type'];
  readonly pickSources: readonly SourceType[];
  resolvePick(entry: SourceEntry, pick: PickResult): Ref | null;
  /** A driving arm fills `driver` (`DrivenSelectionRow`): the arm owns its camera-host geometry. */
  extractRow(ref: Ref, simDays: number): SelectionRow | null;
  readonly focusId?: {
    /** Exact knowledge: a prefix, a literal, or a loaded set. Never a catch-all. */
    claims(id: string): boolean;
    /** A claiming row is authoritative even when this returns null. */
    decode(id: string): Ref | null;
    encode(ref: Ref): string | null;
  };
};
