import type { InputStep } from '../../../../../../../@types/camera/input/InputStep';

export type DragStep = Extract<InputStep, { kind: 'drag' }>;
