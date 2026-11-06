import type { SkyWheelMemory } from '../../../../../../@types/camera/arms/SkyWheelMemory';

/** No wheel step yet, so the first wheel-out at the widest lens lifts. */
export const EMPTY_SKY_WHEEL_MEMORY: SkyWheelMemory = { lastWheelMs: -Infinity };
