/**
 * LabelSettings — cross-cutting label-presentation knobs (the `labels`
 * settings cluster). They apply to every screen label at once, in the label
 * directors' `targetAlpha` stage, and MULTIPLY on top of each Layer's own
 * label gates (`galaxyCatalogs.items.*.labelEnabled`, `milkyWay.labelEnabled`,
 * …): a layer that is off stays off regardless of the mode here.
 */
export type LabelSettings = {
  /**
   * When true, only the label of the currently-focused subject
   * (`selection.focus`) is drawn — every other label is suppressed. With
   * nothing focused, no labels draw at all. The guided tour's declutter
   * mode: each beat's `focus()` cue names its subject, and the rest of the
   * sky stays quiet. Set by the tour via a `scene()` cue and restored by the
   * tour snapshot on exit.
   */
  focusedOnly: boolean;
};
