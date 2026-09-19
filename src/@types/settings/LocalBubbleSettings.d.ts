/**
 * LocalBubbleSettings — the Local Bubble shell overlay: master toggle plus
 * an intensity scale (0-2) layered on top of the distance-window opacity.
 */

export type LocalBubbleSettings = {
  enabled: boolean;
  intensity: number;
};
