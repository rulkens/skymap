import type { ClipData } from '../animation/ClipData';
import type { Ease } from '../animation/Ease';
import type { CameraTweenDescriptor } from './CameraTweenDescriptor';
import type { FocusMotion } from './FocusMotion';

/**
 * FocusMotionRow — one focus-move style's answers: the clip it flies, how long
 * it runs (the tween driver retires on it), the ease the lookOffset fade
 * shares with the clip, and whether it flies to a body the sim clock moves
 * (else the follow approach eases there and no tween is planted).
 */
export type FocusMotionRow<M extends FocusMotion> = {
  readonly clipOf: (d: CameraTweenDescriptor & { motion: M }) => ClipData;
  readonly durationMsOf: (d: CameraTweenDescriptor & { motion: M }) => number;
  readonly easeOf: (d: CameraTweenDescriptor & { motion: M }) => Ease;
  readonly tweensMovingBodies: boolean;
};
