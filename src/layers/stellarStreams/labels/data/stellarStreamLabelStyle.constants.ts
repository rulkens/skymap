/** Caption opacity; the RGB comes from the stream's colourT. */
export const STELLAR_STREAM_LABEL_ALPHA = 0.85;

/** How far `streamTintRgb` exaggerates caption colours past the streaks' own: about 6× the BP−RP spread around 1.0, then 2× saturation. */
export const STELLAR_STREAM_LABEL_TINT = { bpRpPivot: 1, bpRpStretch: 6, saturation: 2 } as const;
