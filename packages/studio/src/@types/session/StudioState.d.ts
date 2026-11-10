/**
 * The injected `studio` slice (ADR 0016). The app's `RootState` does not know it; it is read
 * through the slice's own selectors. Kept after Close, so reopening the same clip keeps the draft.
 */
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { ClipId } from '../../../../../src/@types/animation/ClipId';
import type { RowRef } from '../rows/RowRef';
import type { DraftHistory } from './DraftHistory';
import type { PreviewPins } from './PreviewPins';
import type { StudioResolution } from './StudioResolution';
import type { TimeWindow } from './TimeWindow';

export type StudioState = {
  readonly clipId: ClipId | null;
  /** As opened; dirty = draft !== baseline. */
  readonly baseline: ClipData | null;
  /** Authored form, FocusIds unresolved. */
  readonly draft: ClipData | null;
  /** Bumps on every draft change. */
  readonly revision: number;
  readonly preview: PreviewPins | null;
  readonly resolution: StudioResolution | null;
  readonly selection: RowRef | null;
  /** Row ids. */
  readonly collapsed: readonly string[];
  readonly playheadSec: number;
  /** Null = fit. */
  readonly viewport: TimeWindow | null;
  readonly history: DraftHistory;
};
