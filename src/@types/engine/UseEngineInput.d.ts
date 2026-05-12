import type { EngineCallbacks } from './EngineCallbacks';

export type UseEngineInput = {
  /**
   * Extra callbacks to layer onto the engine's options block.  In
   * practice this is the `engineCallbacks` slice from
   * `useEngineSettings` — settings echoes that drive React-side
   * SettingsPanel state.  Captured at first render; do not expect
   * subsequent changes to take effect.
   */
  extraCallbacks?: Partial<EngineCallbacks>;
};
