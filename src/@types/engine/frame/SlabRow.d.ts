/**
 * SlabRow — one candidate `body-m` slab row, as plain data. A Layer authors
 * its own (`Layer.slabs`); core derives one only for a hostless mesh body
 * (`bodySlabRowOf`). The two radii are separate: the culls and the near plane
 * need the drawn footprint and the occupied sphere as distinct facts.
 */

import type { FadeBand } from '../../math/FadeBand';
import type { PositionedId } from '../../scene/PositionedId';
import type { BodyRowSource } from './BodyRowSource';

export type SlabRow = {
  /** Pose = `ctx.bodyPose(anchorId)`; also the row's `SlabFrame.hostId`. */
  readonly anchorId: PositionedId;
  /** Outermost drawn extent for this view, metres — far edge and both culls. */
  readonly drawRadiusM: (distM: number, pxPerRad: number) => number;
  /** Solid-sphere occupied radius, metres (`bodyFootprintRadiusM`) — drives the near edge / cull. */
  readonly footprintRadiusM: number;
  /** The row exists only while `fadeBand(activeBand, |cam − anchor|) > 0`. */
  readonly activeBand?: FadeBand;
  /** The extra frame lines this row hosts, each while this view's eye is inside
   *  its band (`hostBandOpen`: Mpc from the anchor); no band = always. */
  readonly hosts?: readonly { readonly line: BodyRowSource; readonly band?: FadeBand }[];
};
