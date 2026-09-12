/**
 * ConstellationsSettings — constellation stick figures. The one `enabled` gate
 * governs BOTH the figures and their name captions. `intensity` has no panel
 * control — a store-only dial the line-brightness math reads.
 */

export type ConstellationsSettings = {
  enabled: boolean;
  intensity: number;
};
