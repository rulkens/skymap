/**
 * commitOnEdge — on the frame the winner changes, a DEPARTING driver that
 * declared `commitsOnEdge` bakes its saturated register into `base` verbatim
 * (R12b-1: the authored register, never the displayed pose), and the incoming
 * produce reads that commit. The edge frame's pose is decided here (R12c-1): a
 * pivoting winner renders the AUTHORED register (displaying it re-pins the tilt
 * — one frame of eye walk); a non-pivoting one (clip, tween) would flash the
 * untilted register ~0.4 rad to nadir, so it renders the DISPLAYED pose.
 */
import type { UnknownAction } from '@reduxjs/toolkit';

import type { CameraDriver } from '../../../@types/engine/camera/CameraDriver';
import type { DriverId } from '../../../@types/engine/camera/DriverId';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import { commitCameraPose } from '../../../state/camera/cameraSlice';
import { isFollowDriverId } from '../../../utils/camera/isFollowDriverId';

const NO_ACTIONS: readonly UnknownAction[] = [];

export function commitOnEdge(args: {
  readonly register: FramedCameraPose;
  readonly displayed: FramedCameraPose;
  readonly prevWinner: DriverId;
  readonly winner: CameraDriver;
  readonly drivers: readonly CameraDriver[];
}): {
  /** Null off an edge: the frame renders what the winner produced. */
  readonly render: FramedCameraPose | null;
  /** The pose this edge bakes into `base`, or null. */
  readonly committed: FramedCameraPose | null;
  /** Non-null only on a non-pivoting edge: the register value when `render` had
   * to be the displayed pose. */
  readonly authoredOverride: FramedCameraPose | null;
  readonly actions: readonly UnknownAction[];
} {
  const { register, displayed, prevWinner, winner, drivers } = args;
  const departing = drivers.find((d) => d.id === prevWinner);
  // The follow pair is ONE author: committing between them baked the OLD body's
  // distance into `base`, which the pin then read around the NEW body.
  const sameAuthor =
    prevWinner === winner.id || (isFollowDriverId(prevWinner) && isFollowDriverId(winner.id));
  if (sameAuthor || !departing?.commitsOnEdge) {
    return { render: null, committed: null, authoredOverride: null, actions: NO_ACTIONS };
  }
  const pivots = winner.pivotsOnFocusedBody ?? false;
  return {
    render: pivots ? register : displayed,
    committed: register,
    authoredOverride: pivots ? null : register,
    actions: [commitCameraPose(register)],
  };
}
