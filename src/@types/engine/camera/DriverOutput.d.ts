/**
 * DriverOutput — what one driver's `pose` returns. A row that owns no memory hands `mem` back,
 * so the winner's adoption needs no branch. `own` replaces the row's private slot
 * (`CameraRuntime.own`; absent keeps it). `pivotBody` stands in as the wheel's pivot next frame
 * when the row frames a body no focus names.
 */

import type { FollowMemory } from './FollowMemory';
import type { FramedCameraPose } from '../../camera/FramedCameraPose';

export type DriverOutput<Own = unknown> = {
  readonly pose: FramedCameraPose;
  readonly memory: FollowMemory | null;
  readonly own?: Own;
  readonly pivotBody?: string;
};
