/**
 * LabelSettings — cross-cutting label-presentation knobs (the `labels`
 * settings cluster).
 *
 * Unlike the per-layer label gates (`galaxyCatalogs.items.*.labelEnabled`,
 * `starCatalogs.items.*.labelEnabled`, `structures.items.*.labelEnabled`,
 * `milkyWay.labelEnabled`), these knobs
 * apply across every label producer at once. They MULTIPLY on top of the
 * layer gates — a layer that is off stays off regardless of the mode here.
 */
export type LabelSettings = {
  /**
   * When true, only the label of the currently-focused subject
   * (`selection.focus`) is drawn — every other label is suppressed. With
   * nothing focused, no labels draw at all. The guided tour's declutter
   * mode: each beat's `focus()` cue names its subject, and the rest of the
   * sky stays quiet. Read by all three label producers (famous, structure,
   * Milky Way); set by the tour via a `scene()` cue and restored by the
   * tour snapshot on exit.
   */
  focusedOnly: boolean;
  /**
   * Master gate for the Earth + planet captions in the true-scale foreground
   * (`foregroundLabelsLayer`) — the Moon rides the 'planet' caption kind, so it
   * follows this switch too. Default ON, so a viewer flying the final descent
   * can silence the solar-system body set on its own; the local star map has
   * its own gate on its star-catalog row (`starCatalogs.items.famousStar`).
   * Distinct from `focusedOnly`: that is a cross-cutting COSMO declutter, this
   * is the near-field scene-body caption toggle.
   */
  planetLabelsEnabled: boolean;
};
