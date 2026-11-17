import type { SetupStep } from '../@types/SetupStep';

/** What a step's primary button says. After Finish on one screen it hides this window, so it says that. */
export function setupPrimaryLabel(
  step: SetupStep,
  oneScreen: boolean,
  skyRunning: boolean,
): string {
  switch (step) {
    case 'welcome':
      return 'Start setup';
    case 'daily':
      return 'Finish';
    case 'done':
      return oneScreen && skyRunning ? 'Show the sky' : 'Close setup';
    default:
      return 'Next';
  }
}
