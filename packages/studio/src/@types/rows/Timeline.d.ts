/** The derived timeline the outline, tracks and ruler draw: `buildTimeline`'s output. */
import type { ClipCompileErrorInfo } from './ClipCompileErrorInfo';
import type { TimelineRow } from './TimelineRow';

export type Timeline = {
  /** Visible rows, collapse applied, in outline order. */
  readonly rows: readonly TimelineRow[];
  readonly durationSec: number | null;
  readonly loop: boolean;
  readonly error: ClipCompileErrorInfo | null;
  /** Ruler notches and snap targets: step starts, cue times, End. */
  readonly cueSecs: readonly number[];
};
