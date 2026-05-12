import type { Label } from '../../rendering/Label';
import type { MarkerLine } from '../../rendering/MarkerLine';

/** What a single producer wants to render on the next frame. */
export type LabelProducerOutput = {
  readonly labels: readonly Label[];
  readonly lines: readonly MarkerLine[];
  /**
   * If true, the director should request a continuation render this frame
   * (mid-transition animation needs the loop to stay awake).  Defaults
   * to false; producers only opt in when their state is genuinely
   * evolving frame-to-frame.
   */
  readonly awake: boolean;
};
