/**
 * PassState — what a pass may read. Named for its reader, not for "core":
 * `CoreSettingsState`'s cut is core-versus-Layer, this one is frame-visible. The bags it
 * still names (`gpu`, `data`, `subsystems`, `assetSlots`) leave field by field as each
 * Layer forms (spec §4.5). What it already refuses is `booted`, `requests`,
 * `cameraRuntime`, `cubemapCaptures` and `picking`: no pass may touch the engine's own
 * boot, request-scheduling, camera-runtime, cubemap-capture or picking state.
 */

import type { EngineState } from '../state/EngineState';

export type PassState = Pick<
  EngineState,
  'settings' | 'tier' | 'selection' | 'selectionRows' | 'data' | 'gpu' | 'subsystems' | 'assetSlots'
>;
