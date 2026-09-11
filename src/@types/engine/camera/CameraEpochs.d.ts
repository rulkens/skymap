/**
 * CameraEpochs — one immutable `Epoch` per timed camera channel; replaced
 * wholesale once per frame. `autoRotate`'s ref is `active ? base : null`, so
 * a deactivation and a base re-commit are both ref changes.
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
