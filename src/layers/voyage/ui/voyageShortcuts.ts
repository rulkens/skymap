import { stepVoyageSpeed } from '../state/voyage/slice';
import type { KeyboardShortcut } from '../../../@types/state/input/KeyboardShortcut';
import type { VoyageSection } from '../@types/VoyageSection';

/** The voyage exhibit's keys, ahead of the global table: `[` / `]` step the speed factor, as the missions transport. */
export const voyageShortcuts: readonly KeyboardShortcut<VoyageSection>[] = [
  { keys: '[', run: () => stepVoyageSpeed({ step: -1 }) },
  { keys: ']', run: () => stepVoyageSpeed({ step: 1 }) },
];
