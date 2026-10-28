import type { ClipData } from '../animation/ClipData';
import type { Ease } from '../animation/Ease';
import type { CameraTweenDescriptor } from './CameraTweenDescriptor';
import type { FocusMotion } from './FocusMotion';

/**
 * FocusMotionRow — one focus-move style's answers: the clip it flies, how long
 * it runs (the tween driver retires on it), and the ease the lookOffset fade
 * shares with the clip.
 */
export type FocusMotionRow<M extends FocusMotion> = {
  readonly clipOf: (d: CameraTweenDescriptor & { motion: M }) => ClipData;
  readonly durationMsOf: (d: CameraTweenDescriptor & { motion: M }) => number;
  readonly easeOf: (d: CameraTweenDescriptor & { motion: M }) => Ease;
};
