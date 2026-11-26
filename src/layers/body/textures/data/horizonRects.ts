import type { Vec4 } from '../../../../@types/math/Vec4';

/** The `rect` `lib/horizonLookup.wesl` reads as "no horizon data": it skips the map and reads
 *  fully lit, as the surface looks without one. Tiles pack it for an `'empty'` or unresident
 *  tile, globes while only the placeholder is bound. */
export const NO_HORIZON_RECT: Readonly<Vec4> = [0, 0, 0, 0];

/** A committed whole-globe horizon map: every post of the image. */
export const WHOLE_GLOBE_HORIZON_RECT: Readonly<Vec4> = [0, 0, 1, 1];
