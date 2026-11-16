/**
 * The span the Layer draws: 1900-01-01 to 2100-01-01 (TT), the moon-correction window
 * (`EPHEMERIS_CORRECTIONS`). Two-body elements from one epoch drift by degrees within decades, so past
 * the edges a position would look precise and be wrong; the dots fade out over the last year instead.
 */
export const ASTEROID_WINDOW = {
  startJd: 2415020.5,
  endJd: 2488069.5,
  fadeDays: 365.25,
} as const;
