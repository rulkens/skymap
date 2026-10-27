import type { Ease } from '../animation/Ease';

/**
 * FocusMotion — how one camera tween flies, frozen onto its descriptor at
 * dispatch so a settings change mid-flight never reshapes a move in progress.
 * `style` picks the `FOCUS_MOTIONS` row that turns it into a clip.
 */
export type FocusMotion = {
  readonly style: 'eased';
  readonly durationMs: number;
  readonly ease: Ease;
};
