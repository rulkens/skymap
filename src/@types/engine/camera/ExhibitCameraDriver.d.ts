/**
 * ExhibitCameraDriver — a camera row an exhibit section kind carries. Core owns its activity
 * (on while an exhibit carrying the kind runs, `composeControlSchemes`) and hands `pose` that
 * exhibit's section data.
 */

import type { CameraDriver } from './CameraDriver';
import type { DriverCtx } from './DriverCtx';
import type { DriverOutput } from './DriverOutput';
import type { FollowMemory } from './FollowMemory';

export type ExhibitCameraDriver<D, Own = unknown> = Omit<
  CameraDriver<Own>,
  'isActive' | 'pose' | 'ridesExhibit'
> & {
  pose(ctx: DriverCtx, mem: FollowMemory | null, own: Own | null, data: D): DriverOutput<Own>;
};
