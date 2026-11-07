import type { Vec4 } from '../../../../@types/math/Vec4';

/**
 * Sized like the Milky Way structure captions (`structureMarkerStyles`, 35-150 px), so a stream's
 * name reads at M54's size beside it. The colour is per stream (`streamTintRgb`), so not here.
 */
export const STELLAR_STREAM_LABEL_STYLE = {
  outlineColor: [0, 0, 0, 0.1] as Vec4,
  outlineEmFrac: 0.16,
  worldEmMpc: 5e-4,
  minPixelSize: 35,
  maxPixelSize: 150,
} as const;

/** Caption opacity; the RGB comes from the stream's colourT. */
export const STELLAR_STREAM_LABEL_ALPHA = 0.85;

/** A stream shorter than this on screen goes uncaptioned unless hovered or selected. */
export const STELLAR_STREAM_LABEL_MIN_PX = 150;

/** How far `streamTintRgb` exaggerates caption colours past the streaks' own: about 6× the BP−RP spread around 1.0, then 2× saturation. */
export const STELLAR_STREAM_LABEL_TINT = { bpRpPivot: 1, bpRpStretch: 6, saturation: 2 } as const;
