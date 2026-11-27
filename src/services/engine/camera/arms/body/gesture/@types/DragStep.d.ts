import type { InputStep } from '../../../../../../../../packages/shared/src/@types/camera/input/InputStep';

export type DragStep = Extract<InputStep, { kind: 'drag' }>;
