import type { Vec4 } from '../../../../@types/math/Vec4';

/** Smaller than the Milky Way structure captions: up to 83 names share the halo. The tint is the streaks' blue-horizontal-branch blue. */
export const STELLAR_STREAM_LABEL_STYLE = {
  color: [0.66, 0.77, 1, 0.85] as Vec4,
  outlineColor: [0, 0, 0, 0.1] as Vec4,
  outlineEmFrac: 0.16,
  worldEmMpc: 5e-4,
  minPixelSize: 13,
  maxPixelSize: 28,
} as const;

/** A stream shorter than this on screen goes uncaptioned unless hovered or selected. */
export const STELLAR_STREAM_LABEL_MIN_PX = 80;
