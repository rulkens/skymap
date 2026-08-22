/**
 * A label's proportional screen-space lift off its subject. Minted as part
 * of the leader fold (spec §3.2); read by `label2DDirector`'s lift stage
 * (`config.lift`, gated on this field's presence rather than a `kind` test)
 * when it calls `liftedLabelPlacement`. A label without this field skips the
 * lift entirely — absence of data, not a discriminant.
 */

export type Label2DLift = {
  /** The labelled subject's apparent size in px — drives the proportional lift. */
  readonly subjectSizePx: number;
  /** Screen-px lift of the leader's BOTTOM off the subject. Default 0. */
  readonly lineBottomLiftPx?: number;
};
