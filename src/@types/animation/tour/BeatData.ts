import type { ClipData } from '../ClipData';
import type { BeatCaption } from './BeatCaption';

/**
 * BeatData — a single beat in a tour: an optional entering clip, an optional
 * caption shown during the dwell phase, and the ambient clip the dwell plays.
 *
 * `enterClip` is the establishing-move animation for the beat — OPTIONAL: omit it
 * when the previous beat already framed the subject (the dwell then begins
 * immediately and the caption reveals at once). Focus lives INSIDE the clip as
 * a `focus()` or `focusId()` cue — the beat has no separate focus field. Scene
 * changes (visibility, settings) are expressed as in-clip
 * `show()`/`hide()`/`scene()` cues.
 *
 * `caption` is the beat's placard — a title, optional markdown body, and an
 * anchor (`BeatCaption`); null for a silent beat. The overlay reveals it once
 * the establishing fly lands and clears it when the next beat begins. The
 * runtime slice does not store the caption — it is derived from this field via
 * the active `tourId` + `beatIndex`.
 *
 * `dwellClip` is the ambient motion played while the beat holds — any clip
 * (`dwellDrift(8)` is the canonical gentle orbit+bob; a slow flyPath ring or a
 * push-in work too). Its COMPILED DURATION is the beat's dwell length: the
 * auto-advance timer and the overlay's countdown ring both derive from it
 * (`visitBeatSaga` computes it from the resolved clip and carries it on
 * `dwellStarted`). Keyboard or gesture input can still interrupt early.
 */
export type BeatData = {
  readonly caption: BeatCaption | null;
  readonly dwellClip: ClipData;
  readonly enterClip?: ClipData;
};
