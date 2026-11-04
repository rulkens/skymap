import type { SetupStep } from '../../../@types/SetupStep';
import { APP_SUMMARY } from '../../../data/appSummary';

// Welcome's title is the wordmark and Done's follows the sky, so neither is here.
export const STEP_TITLES: Partial<Record<SetupStep, string>> = {
  mode: 'Where will it show?',
  display: 'Which screen?',
  tablet: 'Connect a tablet',
  daily: 'Every day',
};

export const STEP_LEADS: Partial<Record<SetupStep, string>> = {
  welcome: APP_SUMMARY,
  mode: 'Pick how the sky is drawn. You can change it later in the controls.',
  display: 'Pick the screen the sky fills. It shows a test grid until you move on.',
  tablet: 'A phone or tablet on the same network can drive the sky.',
  daily: 'How Skymap starts and when it fetches new data.',
};

// Controls where Enter already means something; elsewhere in a step it takes the primary action.
export const KEEPS_ENTER = 'button, a, select, textarea, input[type="time"]';
