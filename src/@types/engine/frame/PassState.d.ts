/**
 * PassState: what a pass may read, named for its reader (frame-visible), unlike
 * `CoreSettingsState`'s core-versus-Layer cut. It refuses `booted`, `requests`,
 * `cameraRuntime`, `cubemapCaptures` and `picking`: the engine's own boot,
 * request-scheduling, camera-runtime, cubemap-capture and picking state.
 */

import type { EngineState } from '../state/EngineState';

export type PassState = Pick<
  EngineState,
  'settings' | 'tier' | 'selection' | 'selectionRows' | 'orbitTrailGroups' | 'gpu' | 'subsystems'
>;
