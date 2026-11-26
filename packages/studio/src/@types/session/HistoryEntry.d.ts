/**
 * One undo step. In `past`, `draft` is the draft BEFORE the edit (what undo returns to); in
 * `future`, the draft redo returns to. `label` names the edit for "Undo Distance"; edits sharing a
 * non-null `gesture` coalesce into one entry.
 */
import type { ClipData } from '../../../../../src/@types/animation/ClipData';

export type HistoryEntry = {
  readonly draft: ClipData;
  readonly label: string;
  readonly gesture: string | null;
};
