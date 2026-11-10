/**
 * The clip factor ramps `from → to` over [startSec, endSec] on the fade controller's smoothstep
 * curve. A later segment supersedes it from its own `startSec`, starting from the value this one
 * reached there, as a `FadeController.fadeTo` retarget mid-ramp does.
 */
export type FactorSegment = {
  readonly startSec: number;
  readonly endSec: number;
  readonly from: number;
  readonly to: number;
};
