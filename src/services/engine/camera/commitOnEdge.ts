/**
 * commitOnEdge — on the frame the winner changes, a DEPARTING driver that
 * declared `commitsOnEdge` bakes into `base` verbatim, and the incoming produce
 * reads that commit. `'register'` bakes the authored register (R12b-1); the edge
 * pose is then decided here (R12c-1): a pivoting winner renders the register
 * (displaying it re-pins the tilt — one frame of eye walk), a non-pivoting one
 * (clip, tween) would flash the untilted register ~0.4 rad to nadir, so it
 * renders the DISPLAYED pose. `'displayed'` bakes what was on screen and lets
 * the winner's produce render: a pin onto a focus the departing row did not
 * aim at would move the eye, where a follow row's capture is eye-preserving.
 */
import type { UnknownAction } from '@reduxjs/toolkit';

import type { CameraDriver } from '../../../@types/engine/camera/CameraDriver';
import type { DriverId } from '../../../@types/engine/camera/DriverId';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import { commitCameraPose } from '../../../state/camera/cameraSlice';

const NO_ACTIONS: readonly UnknownAction[] = [];

export function commitOnEdge(args: {
  readonly register: FramedCameraPose;
  readonly displayed: FramedCameraPose;
  readonly prevWinner: DriverId;
  readonly winner: CameraDriver;
  readonly drivers: readonly CameraDriver[];
}): {
  /** Null: the frame renders what the winner produced. */
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
  // One epoch is one author: the follow pair shares `follow`, so committing between
  // them would bake the OLD body's distance into `base`, which the pin then read
  // around the NEW body.
  const sameAuthor =
    prevWinner === winner.id ||
    (departing?.epoch !== undefined && departing.epoch === winner.epoch);
  const mode = departing?.commitsOnEdge;
  if (sameAuthor || mode === undefined) {
    return { render: null, committed: null, authoredOverride: null, actions: NO_ACTIONS };
  }
  if (mode === 'displayed') {
    return {
      render: null,
      committed: displayed,
      authoredOverride: null,
      actions: [commitCameraPose(displayed)],
    };
  }
  const pivots = winner.pivotsOnFocusedBody ?? false;
  return {
    render: pivots ? register : displayed,
    committed: register,
    authoredOverride: pivots ? null : register,
    actions: [commitCameraPose(register)],
  };
}
