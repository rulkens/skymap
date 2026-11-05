import type { CameraArmKind } from '../../../../@types/camera/arms/CameraArmKind';

/** Arms with a parent to climb to — every arm but the world arm itself. */
export type ClimbableKind = Exclude<CameraArmKind, 'absolute'>;
