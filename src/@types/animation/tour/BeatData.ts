import type { ClipData } from '../ClipData';

/**
 * BeatData — a single beat in a tour: a clip to play, an optional caption
 * shown during the dwell phase, and a dwell duration.
 *
 * `clip` is the full establishing-move animation for the beat. Focus lives
 * INSIDE the clip as a `focus()` or `focusId()` cue — the beat has no
 * separate focus field. Scene changes (visibility, settings) are expressed
 * as tour-level `setup` actions or as in-clip `scene()` cues.
 *
 * `caption` renders in the UI overlay during the dwell phase; null for no
 * caption. Captions are ephemeral — they live only for the beat's dwell and
 * are cleared when the next beat begins.
 *
 * `dwellSec` is the auto-advance delay in seconds after the clip completes.
 * Keyboard or gesture input can interrupt early; the timer expiration proceeds
 * to the next beat automatically.
 */
export type BeatData = {
  readonly caption: string | null;
  readonly dwellSec: number;
  readonly clip: ClipData;
};
