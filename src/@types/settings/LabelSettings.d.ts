/**
 * LabelSettings — cross-cutting label-presentation knobs (the `labels`
 * settings cluster).
 *
 * Unlike the per-layer label gates (`galaxyCatalogs.items.*.labelEnabled`,
 * `starCatalogs.items.*.labelEnabled`, `structures.items.*.labelEnabled`,
 * `bodies.items.*.labelEnabled`, `milkyWay.labelEnabled`), these knobs apply
 * across the three COSMO-slab label producers at once — famous galaxies,
 * structures, and the Milky Way singleton, each registered as `produceLabels`
 * on the label director and drawn through `labelsLayer`. They MULTIPLY on top
 * of those three producers' own layer gates — a layer that is off stays off
 * regardless of the mode here.
 *
 * The star-map and scene-body (Earth / planet / Sun) captions do NOT read
 * this cluster. They draw through `foregroundLabelsLayer`, a separate
 * NEAR0-slab pass with its own declutter and temporal envelope, and their
 * visibility is governed entirely by `starCatalogs.items.famousStar.labelEnabled`
 * and `bodies.items.*.labelEnabled` — `focusedOnly` reaches none of them,
 * on or off.
 */
export type LabelSettings = {
  /**
   * When true, only the label of the currently-focused subject
   * (`selection.focus`) is drawn — every other label is suppressed. With
   * nothing focused, no labels draw at all. The guided tour's declutter
   * mode: each beat's `focus()` cue names its subject, and the rest of the
   * sky stays quiet. Read by all three COSMO label producers (famous,
   * structure, Milky Way); set by the tour via a `scene()` cue and restored
   * by the tour snapshot on exit.
   */
  focusedOnly: boolean;
};
