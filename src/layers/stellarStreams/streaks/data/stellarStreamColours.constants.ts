import type { Vec3 } from '../../../../@types/math/Vec3';

/**
 * The streak palette's two ends; `streams.wesl` declares the same pair as `BHB` and `GIANT`
 * (a parity test keeps them equal), and the captions mix them by each stream's mean colourT.
 */
export const STREAM_BHB_RGB: Vec3 = [0.62, 0.76, 1.0];
export const STREAM_GIANT_RGB: Vec3 = [1.0, 0.7, 0.4];
