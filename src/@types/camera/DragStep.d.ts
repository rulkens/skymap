import type { InputStep } from './InputStep';

export type DragStep = Extract<InputStep, { kind: 'drag' }>;
