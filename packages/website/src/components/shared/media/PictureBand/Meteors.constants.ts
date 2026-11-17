// The wait between two meteors, in seconds: often enough to be caught on one slide or two, never on every one.
// Past it the next comes with the next view that has a sky.
export const GAP_SEC = [6, 16] as const;
// After a view's 1.4 s cross-fade, so a meteor never crosses two pictures.
export const SETTLE_MS = 2000;
