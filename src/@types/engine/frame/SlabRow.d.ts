/**
 * SlabRow — one candidate `body-m` slab row, as plain data. Core derives one
 * per store body (`bodySlabRowOf`); a Layer authors its own (`Layer.slabs`).
 *
 * Camera fields are deliberately absent: driving the camera and hosting a
 * metre frame vary independently (spec §2.5). The two radii are separate
 * because the culls and the near plane need the drawn footprint and the
 * occupied sphere as distinct facts — see `bodyDrawRadiusM`.
 */

import type { FadeBand } from '../../math/FadeBand';
import type { SlabHostId } from './SlabHostId';

export type SlabRow = {
  /** Pose = `ctx.bodyPose(anchorId)`; also the row's `SlabFrame.hostId`. */
  readonly anchorId: SlabHostId;
  /** Outermost drawn extent for this view, metres — far edge and both culls. */
  readonly drawRadiusM: (distM: number, pxPerRad: number) => number;
  /** Solid-sphere occupied radius, metres (`bodyFootprintRadiusM`) — drives the near edge / cull. */
  readonly footprintRadiusM: number;
  /** The row exists only while `fadeBand(activeBand, |cam − anchor|) > 0`. */
  readonly activeBand?: FadeBand;
  /** Which frame-graph line consumes the row (`BodyRowSource`). */
  readonly source: 'foreground' | 'lens';
};
