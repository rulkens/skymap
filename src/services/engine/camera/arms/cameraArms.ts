/**
 * The arm table (spec §2.4): a new arm is a new `CameraArmKind` key plus its row.
 * Getters, not fields: a row reaches back up through `hostOrThrow` → `rowFor`
 * → here, so a field read would freeze `undefined` into the table whenever a
 * row module is the import cycle's entry.
 */

import type { ClimbRow } from '../../../../@types/camera/ClimbRow';
import type { ClimbableKind } from '../../../../@types/camera/ClimbableKind';
import type { CameraArmRow } from '../../../../@types/camera/CameraArmRow';
import { absoluteCameraArm } from './world/absoluteCameraArm';
import { bodyCameraArm } from './body/bodyCameraArm';
import { siteCameraArm } from './site/siteCameraArm';
import { skyCameraArm } from './sky/skyCameraArm';

export const CAMERA_ARMS: { readonly absolute: CameraArmRow<'absolute'> } & {
  readonly [K in ClimbableKind]: ClimbRow<K>;
} = {
  get absolute() {
    return absoluteCameraArm;
  },
  get body() {
    return bodyCameraArm;
  },
  get site() {
    return siteCameraArm;
  },
  get sky() {
    return skyCameraArm;
  },
};
