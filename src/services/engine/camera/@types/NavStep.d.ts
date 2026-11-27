import type { InputStep } from '../../../../../packages/shared/src/@types/camera/input/InputStep';

/** NavStep — the subsequence of the frame's InputSteps the navigator reads. */
export type NavStep = Extract<InputStep, { kind: 'navDrag' | 'gestureEnd' }>;
