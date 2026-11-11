/** Everything the studio knows about one row kind, as data plus pure functions of its subject. */
import type { Effect } from '../../../../../src/@types/animation/Effect';
import type { ChannelFamily } from '../rows/ChannelFamily';
import type { RowLabel } from '../rows/RowLabel';
import type { CapturedView } from './CapturedView';
import type { FieldSpec } from './FieldSpec';
import type { GlyphId } from './GlyphId';
import type { MarkShape } from './MarkShape';

export type RowKindSpec<T> = {
  /** Omitted when the glyph depends on the channel (set, spin, rate, osc): the model takes its family's. */
  readonly glyph?: GlyphId | ((subject: T) => GlyphId);
  readonly mark: MarkShape;
  readonly writes: (subject: T) => readonly ChannelFamily[];
  readonly label: (subject: T) => RowLabel;
  readonly fields: readonly FieldSpec<T>[];
  /** Subject-bound kinds: the inspector's Resolved line from the same path in the resolved clip (Q22). */
  readonly resolved?: (resolved: Effect) => string;
  /** Use current view: the step rewritten from the drawn camera; null = no button. Start pins instead. */
  readonly fromView: ((subject: T, view: CapturedView) => Effect) | null;
};
