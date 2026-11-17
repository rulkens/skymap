import type { SetupStep } from '../@types/SetupStep';
import { SETUP_STEPS } from './setupSteps';

/** The rail's steps, then the screen after Finish: the order Next and Back walk. */
export const SETUP_STEP_ORDER: readonly SetupStep[] = [
  ...SETUP_STEPS.map(({ step }) => step),
  'done',
];
