import type { SetupStep } from '../@types/SetupStep';

/** The steps the rail lists, in order, with their short names; `done` follows them and is not listed. */
export const SETUP_STEPS: readonly { step: Exclude<SetupStep, 'done'>; name: string }[] = [
  { step: 'welcome', name: 'Welcome' },
  { step: 'mode', name: 'Where it shows' },
  { step: 'display', name: 'Which screen' },
  { step: 'tablet', name: 'Connect a tablet' },
  { step: 'daily', name: 'Every day' },
];
