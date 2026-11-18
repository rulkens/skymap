/**
 * One `LABEL_STYLES` row as the shader reads it, `struct LabelStyle` in `labels/io.wesl`
 * (`labelRecord.parity` holds them equal): word offsets into a row of `LABEL_STYLE_GPU_WORDS`.
 * Colours are straight RGBA; `flags` is a set of `LABEL_STYLE_FLAGS`.
 */
export const LABEL_STYLE_GPU = {
  color: 0,
  outlineColor: 4,
  leaderColor: 8,
  outlineEmFrac: 12,
  emMpc: 13,
  emTimesRadius: 14,
  flags: 15,
  liftRadii: 16,
  liftMinPx: 17,
  leaderGapPx: 18,
  leaderWidthPx: 19,
} as const;

export const LABEL_STYLE_GPU_WORDS = 20;

/** `leaderColor`: the row names its leader's colour; without it the leader takes the label's. */
export const LABEL_STYLE_FLAGS = {
  above: 1,
  leaderFromRim: 2,
  leaderColor: 8,
} as const;
