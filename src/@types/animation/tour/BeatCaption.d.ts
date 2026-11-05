/**
 * BeatCaption — the on-screen text for a single tour beat: a small mono title
 * label, and the narration as subtitles, one `lines` entry at a time.
 *
 * Authors break `lines` at phrase boundaries; `lineSchedule` times them across
 * the beat's dwell, and the subtitle fit test guards each line's reading time.
 * Plain text only.
 *
 * The caption is derived tour state, not stored: the takeover holds the tour
 * id, the runtime slice `beatIndex`, and selectors resolve the active beat's caption from
 * the registry. A beat with no caption sets the field to `null` on `BeatData`.
 */

export type BeatCaption = {
  readonly title: string;
  /** Narration, one subtitle per entry, author-broken at phrase boundaries. Plain text. ≥ 1. */
  readonly lines: readonly string[];
};
