/**
 * One visible row of the outline and its track lane, derived by `buildTimeline` from the draft and
 * the compile. Times are seconds from clip start; all three are null until the draft resolves.
 */
import type { ClipCompileReason } from '../../../../../src/@types/animation/ClipCompileReason';
import type { GlyphId } from '../kinds/GlyphId';
import type { ChannelFamily } from './ChannelFamily';
import type { RowKind } from './RowKind';
import type { RowLabel } from './RowLabel';
import type { RowRef } from './RowRef';

export type TimelineRow = {
  /** `rowKey(ref)`. */
  readonly id: string;
  readonly ref: RowRef;
  readonly kind: RowKind;
  readonly depth: number;
  readonly parentId: string | null;
  readonly expandable: boolean;
  readonly collapsed: boolean;
  /** Inside a fork. */
  readonly background: boolean;
  /** Icon tint; null for structure rows. */
  readonly family: ChannelFamily | null;
  /** The icon to draw: the kind's own, else its channel family's. Views read only this. */
  readonly glyph: GlyphId;
  /** A group: the union of its children's. */
  readonly writes: readonly ChannelFamily[];
  readonly label: RowLabel;
  /** '4 s', '0 s', 'end', '∞', '–' (unresolved). */
  readonly duration: string;
  readonly startSec: number | null;
  /** Awaited end. */
  readonly endSec: number | null;
  /** Visible extent: a cue's `over`, a windowed osc's window, a perpetual osc to clip end. */
  readonly tailEndSec: number | null;
  /** A flyPath's waypoint arrival times (the compiler's `knotSecs`), for its lane's knots. */
  readonly knotSecs?: readonly number[];
  readonly errors: readonly ClipCompileReason[];
  /** Folded over a culprit: the outline flags it ⚠ so the error stays findable. */
  readonly hidesErrors: boolean;
};
