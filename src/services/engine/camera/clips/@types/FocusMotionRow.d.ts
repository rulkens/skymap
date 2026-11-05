import type { ClipData } from '../../../../../@types/animation/ClipData';
import type { Ease } from '../../../../../@types/animation/Ease';
import type { CameraTweenDescriptor } from '../../../../../@types/camera/focusMotion/CameraTweenDescriptor';
import type { FocusMotion } from '../../../../../@types/camera/focusMotion/FocusMotion';

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
