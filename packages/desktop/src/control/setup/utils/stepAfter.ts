import type { SetupStep } from '../@types/SetupStep';
import { SETUP_STEP_ORDER } from '../data/setupStepOrder';
import { hasOneScreen } from './hasOneScreen';

/** The step Next leads to; with one screen there is nothing to pick, so "Which screen" is passed over. */
export function stepAfter(step: SetupStep, displayCount: number): SetupStep {
  const next = SETUP_STEP_ORDER[SETUP_STEP_ORDER.indexOf(step) + 1] ?? 'done';
  return next === 'display' && hasOneScreen(displayCount) ? stepAfter(next, displayCount) : next;
}
