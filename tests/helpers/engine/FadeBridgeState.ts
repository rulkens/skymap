import type { EngineState } from '../../../src/@types/engine/state/EngineState';

/** The state slice every fade bridge feeds the row closures — production's `ApplyIntentState`. */
export type FadeBridgeState = Pick<
  EngineState,
  'settings' | 'subsystems' | 'assetSlots' | 'gpu' | 'fadeRows'
>;
