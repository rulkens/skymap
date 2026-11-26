import type { ZoomLimitPush } from '../arms/ZoomLimitPush';

/** The zoom (Σ |ln f|) an unbroken run of non-fresh notches has spent against one limit, the
 * drain's only push memory; `null` when the last step pressed none. */
export type ZoomLimitPress = { readonly edge: ZoomLimitPush['edge']; readonly ln: number };
