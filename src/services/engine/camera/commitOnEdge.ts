/**
 * commitOnEdge — on the frame the winner changes, a DEPARTING driver that
 * declared `commitsOnEdge` has its saturated register baked into `base`
 * verbatim (R12b-1: the authored register, never the displayed pose). Produce
 * already ran the INCOMING driver against the pre-commit `base`, so which pose
 * covers the edge frame depends on that driver (R12c-1): a pivoting one
 * re-derives its image downstream and renders the AUTHORED register (the
 * displayed pose would be re-pinned — one frame of eye walk); a non-pivoting one
 * (clip, tween) would flash the untilted register ~0.4 rad to nadir, so it
 * renders the DISPLAYED pose while the register is pinned to its authored value.
 */

import type { UnknownAction } from '@reduxjs/toolkit';

import type { CameraDriver } from '../../../@types/engine/camera/CameraDriver';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import { commitCameraPose } from '../../../state/camera/cameraSlice';

const NO_ACTIONS: readonly UnknownAction[] = [];

export function commitOnEdge(args: {
  readonly register: FramedCameraPose;
  readonly displayed: FramedCameraPose;
  readonly produced: FramedCameraPose;
  readonly prevWinner: string;
  readonly winner: CameraDriver;
  readonly drivers: readonly CameraDriver[];
}): {
  readonly render: FramedCameraPose;
  /**
   * Non-null only on a non-pivoting edge: the register value when `render` had
   * to be the displayed pose.
   */
  readonly authoredOverride: FramedCameraPose | null;
  readonly actions: readonly UnknownAction[];
} {
  const { register, displayed, produced, prevWinner, winner, drivers } = args;
  const departing = drivers.find((d) => d.id === prevWinner);
  if (prevWinner === winner.id || !departing?.commitsOnEdge) {
    return { render: produced, authoredOverride: null, actions: NO_ACTIONS };
  }
  const pivots = winner.pivotsOnFocusedBody ?? false;
  return {
    render: pivots ? register : displayed,
    authoredOverride: pivots ? null : register,
    actions: [commitCameraPose(register)],
  };
}
