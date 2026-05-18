import type { RefObject } from 'react';
import type { EngineHandle } from './EngineHandle';
import type { PointOfInterest } from './subsystems/PointOfInterest';

/**
 * Inputs to the POI deep-link orchestrator hook.  Sister to
 * `UseFocusUrlInput` (the galaxy version).
 *
 * `focusedPoiId` is the React-side mirror of the engine's selected POI
 * id (driven by the `onPoiFocusChange` callback in EngineCallbacks).
 * `ready` lets the drain wait until the engine has finished bootstrap
 * — same gate the galaxy hook uses (otherwise `focusOnPoi` would race
 * the camera construction).
 * `pois` is the static anchor table the drain looks the id up in;
 * passed in by the caller rather than read from the engine because
 * App.tsx has no public read accessor for the merged POI list (the
 * POI subsystem owns it).
 * `engineHandleRef` is a mutable ref because the engine handle is
 * constructed asynchronously during App mount and should not retrigger
 * this hook on assignment.
 */
export type UsePoiUrlSyncInput = {
  readonly focusedPoiId: string | null;
  readonly ready: boolean;
  readonly pois: readonly PointOfInterest[];
  readonly engineHandleRef: RefObject<EngineHandle | null>;
};
