/**
 * A label's proportional screen-space lift off its subject. Minted here as
 * part of the leader fold (spec §3.2); not yet read by any producer or the
 * director — a later task wires the lift math into `liftedLabelPlacement`.
 */

export type Label2DLift = {
  /** The labelled subject's apparent size in px — drives the proportional lift. */
  readonly subjectSizePx: number;
  /** Screen-px lift of the leader's BOTTOM off the subject. Default 0. */
  readonly lineBottomLiftPx?: number;
};
