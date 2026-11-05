/**
 * CameraEpochs — one immutable `Epoch` per timed camera channel; replaced
 * wholesale once per frame. `autoRotate`'s ref is `active ? base : null`, so
 * a deactivation and a base re-commit are both ref changes.
 */
import type { Epoch } from './Epoch';
import type { CameraTweenDescriptor } from '../../camera/focusMotion/CameraTweenDescriptor';
import type { FrameTween } from '../../camera/focusMotion/FrameTween';
import type { FramedCameraPose } from '../../camera/pose/FramedCameraPose';
import type { SelectionRow } from '../SelectionRow';
import type { CameraAim } from '../../camera/pose/CameraAim';
import type { CameraState } from '../../camera/orbitCamera/CameraState';

export type CameraEpochs = {
  readonly tween: Epoch<CameraTweenDescriptor>;
  readonly frameTween: Epoch<FrameTween>;
  readonly autoRotate: Epoch<FramedCameraPose>;
  readonly follow: Epoch<SelectionRow>;
  readonly clip: Epoch<NonNullable<CameraState['clip']>>;
  /** Ref: the `camera.aim` token, which every re-aim replaces. */
  readonly aim: Epoch<CameraAim>;
};
