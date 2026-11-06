import type { SkyExitPush } from '../../../../../../@types/camera/arms/SkyExitPush';

/** No push yet; one shared object, so an unchanged empty memory keeps its identity. */
export const EMPTY_SKY_EXIT_PUSH: SkyExitPush = { pushLn: 0, lastPushMs: -Infinity };
