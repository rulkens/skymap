/** Frames between chunk plans while chunks are in flight: a fetch takes hundreds of ms, so a per-frame walk of the index buys nothing. */
export const STAR_PLAN_INTERVAL_FRAMES = 4;
