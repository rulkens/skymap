/**
 * sampledTracksSettled — `loadSampledTracksSaga` is done with these ids, each track in
 * `trajectoryRegistry` or failed for good. The one signal that presence can be judged on the
 * loaded window rather than on a track still in flight.
 */
import { createAction } from '@reduxjs/toolkit';

import type { SceneBodyId } from '../../@types/scene/SceneBodyId';

export const sampledTracksSettled = createAction<{ ids: readonly SceneBodyId[] }>(
  'bodies/sampledTracksSettled',
);
