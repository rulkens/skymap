/**
 * A label's proportional screen-space lift off its subject. Minted as part
 * of the leader fold (spec §3.2); read by `label2DDirector`'s lift stage
 * (`config.lift`, gated on this field's presence rather than a `kind` test)
 * when it calls `liftedLabelPlacement`. A label without this field skips the
 * lift entirely — absence of data, not a discriminant.
 */

import type { Vec3 } from '../math/Vec3';

export type Label2DLift = {
  /** The labelled subject's apparent size in px — drives the proportional lift. */
  readonly subjectSizePx: number;
  /** Screen-px lift of the leader's BOTTOM off the subject. Default 0. */
  readonly lineBottomLiftPx?: number;
  /**
   * Device px an engraved name's ink keeps above its subject's centre, in place of
   * `antiqueInkGapPx`'s rim rule: the antique look sets it on a title, which clears
   * its star's glyph and halo.
   */
  readonly inkGapPx?: number;
  /**
   * A ringed subject's ring (unit pole, outer radius in Mpc): the antique declutter
   * keeps a farther name off the ring's ellipse as well as off the globe.
   */
  readonly ring?: { readonly pole: Readonly<Vec3>; readonly outerRadiusMpc: number };
};
