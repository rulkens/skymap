import type { SetupStep } from '../@types/SetupStep';
import { SETUP_STEP_ORDER } from '../data/setupStepOrder';
import { hasOneScreen } from './hasOneScreen';

/** The step Back leads to, passing over "Which screen" as Next does on one screen. */
export function stepBefore(step: SetupStep, displayCount: number): SetupStep {
  const previous = SETUP_STEP_ORDER[SETUP_STEP_ORDER.indexOf(step) - 1] ?? 'welcome';
  return previous === 'display' && hasOneScreen(displayCount)
    ? stepBefore(previous, displayCount)
    : previous;
}
