import type { MemOf } from './MemOf';
import type { CameraArmKind } from './CameraArmKind';

/** The runtime's arm-local memory, wiped whenever `key` (a `frameKey`) changes. */
export type CameraArmMemory = { readonly key: string; readonly value: MemOf[CameraArmKind] };
