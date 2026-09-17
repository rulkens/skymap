/**
 * BloomSettings — the bloom post pass. `enabled` is read at frame-program
 * BUILD, not per frame: it changes the pass shape, so flipping it rebuilds.
 */
export type BloomSettings = {
  enabled: boolean;
  strength: number;
  threshold: number;
};
