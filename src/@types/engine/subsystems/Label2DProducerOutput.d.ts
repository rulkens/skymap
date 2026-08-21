import type { Label2D } from '../../rendering/Label2D';

/**
 * What a single producer wants to render on the next frame. Anchor lines
 * ride on individual labels' `leader` field — the director synthesizes the
 * drawn `MarkerLine`s at flush time, so producers emit no sibling array.
 */
export type Label2DProducerOutput = {
  readonly labels: readonly Label2D[];
  /**
   * If true, the director should request a continuation render this frame
   * (mid-transition animation needs the loop to stay awake).  Defaults
   * to false; producers only opt in when their state is genuinely
   * evolving frame-to-frame.
   */
  readonly awake: boolean;
};
