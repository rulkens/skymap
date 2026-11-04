import type { CameraArmKind } from './CameraArmKind';

/** Arms with a parent to climb to — every arm but the world arm itself. */
export type ClimbableKind = Exclude<CameraArmKind, 'absolute'>;
