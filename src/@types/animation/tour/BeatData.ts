import type { ClipData } from '../ClipData';
import type { BeatCaption } from './BeatCaption';

/**
 * BeatData — a single beat in a tour: a clip to play, an optional caption
 * shown during the dwell phase, and a dwell duration.
 *
 * `clip` is the full establishing-move animation for the beat. Focus lives
 * INSIDE the clip as a `focus()` or `focusId()` cue — the beat has no
 * separate focus field. Scene changes (visibility, settings) are expressed
 * as tour-level `setup` actions or as in-clip `scene()` cues.
 *
 * `caption` is the beat's placard — a title, optional markdown body, and an
 * anchor (`BeatCaption`); null for a silent beat. The overlay reveals it once
 * the establishing fly lands and clears it when the next beat begins. The
 * runtime slice does not store the caption — it is derived from this field via
 * the active `tourId` + `beatIndex`.
 *
 * `dwellSec` is the auto-advance delay in seconds after the clip completes.
 * Keyboard or gesture input can interrupt early; the timer expiration proceeds
 * to the next beat automatically.
 */
export type BeatData = {
  readonly caption: BeatCaption | null;
  readonly dwellSec: number;
  readonly clip: ClipData;
};
