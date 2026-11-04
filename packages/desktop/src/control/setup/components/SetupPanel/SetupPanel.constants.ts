import type { SetupSaveState } from '../../@types/SetupSaveState';

// The idle line is a no-break space so the panel does not grow when "Saving" first appears.
export const SAVE_STATE_TEXT: Record<SetupSaveState, string> = {
  idle: '\u00a0',
  saving: 'Saving',
  saved: 'Saved',
};
