import type { InputStep } from '../../../../@types/camera/input/InputStep';

/** NavStep — the subsequence of the frame's InputSteps the navigator reads. */
export type NavStep = Extract<InputStep, { kind: 'navDrag' | 'gestureEnd' }>;
