/** One row's text per the naming table: Name | Op Value · qualifier; duration is formatted separately. */
import type { FocusId } from '../../../../../src/@types/animation/FocusId';
import type { SelectionRefBase } from '../../../../../src/@types/engine/selection/SelectionRefBase';
import type { LabelOp } from './LabelOp';

export type RowLabel = {
  /** Closed vocabulary, at most 11 characters. */
  readonly name: string;
  readonly op: LabelOp;
  /** '300 Mpc', '±5.2° /16 s', 'via c65, m31 +10'. */
  readonly value: string;
  /** Q22: a bound step shows the subject only, '→ ◎M31'; a Focus step's subject is a selection ref. */
  readonly subject?: FocusId | SelectionRefBase;
  /** After ' · ': 'flow', 'loops', 'fade 2 s'. */
  readonly qualifier?: string;
};
