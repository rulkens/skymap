import type { Label2D } from '../../rendering/Label2D';
import type { MarkerLine } from '../../rendering/MarkerLine';

/** What a single producer wants to render on the next frame. */
export type Label2DProducerOutput = {
  readonly labels: readonly Label2D[];
  readonly lines: readonly MarkerLine[];
  /**
   * If true, the director should request a continuation render this frame
   * (mid-transition animation needs the loop to stay awake).  Defaults
   * to false; producers only opt in when their state is genuinely
   * evolving frame-to-frame.
   */
  readonly awake: boolean;
};
