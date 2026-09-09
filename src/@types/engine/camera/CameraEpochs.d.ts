/**
 * CameraEpochs — the immutable replacement for `CameraClock`: one `Epoch`
 * per channel. `autoRotate`'s ref folds the clock's `lastAutoRotateActive` +
 * `lastBaseRef` into one value (`active ? base : null`).
 */
import type { Epoch } from './Epoch';
import type { CameraTweenDescriptor } from '../../camera/CameraTweenDescriptor';
import type { FrameTween } from '../../camera/FrameTween';
import type { FramedCameraPose } from '../../camera/FramedCameraPose';
import type { SelectionRow } from '../SelectionRow';
import type { CameraState } from '../../camera/CameraState';

export type CameraEpochs = {
  readonly tween: Epoch<CameraTweenDescriptor>;
  readonly frameTween: Epoch<FrameTween>;
  readonly autoRotate: Epoch<FramedCameraPose>;
  readonly follow: Epoch<SelectionRow>;
  readonly clip: Epoch<NonNullable<CameraState['clip']>>;
};
