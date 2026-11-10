/** One row's text per the naming table: Name | Op Value · qualifier; duration is formatted separately. */
import type { FocusId } from '../../../../../src/@types/animation/FocusId';
import type { LabelOp } from './LabelOp';

export type RowLabel = {
  /** Closed vocabulary, at most 11 characters. */
  readonly name: string;
  readonly op: LabelOp;
  /** '300 Mpc', '±5.2° /16 s', 'via c65, m31 +10'. */
  readonly value: string;
  /** Q22: a bound step shows the subject only, '→ ◎M31'. */
  readonly subject?: FocusId;
  /** After ' · ': 'flow', 'loops', 'fade 2 s'. */
  readonly qualifier?: string;
};
