/**
 * The missions Layer: the sampled craft's (Voyager's) trails and captions, their `missions` and
 * `missionTrails` settings clusters, the track load, and the Voyager exhibit with its mission timeline kind.
 * It owns the nine craft body rows (core still draws them until the roster moves).
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { NEAR0 } from '../../services/engine/frame/slabs';
import { missionsLayerSettings } from './state/slices';
import { missionsVisibility } from './visibility';
import { loadSpacecraftTracksSaga } from './sagas/loadSpacecraftTracksSaga';
import { create } from './create';
import { destroy } from './destroy';
import { missionTrailsPass } from './passes/missionTrailsPass';
import { produceMissionCaptions } from './present/produceMissionCaptions';
import { missionsLayerExhibits } from './exhibits/exhibits';
import { MISSIONS_BODY_ROWS } from './bodies/missionsBodyRows';

export const missionsLayer = defineLayer({
  name: 'missions',
  bodies: MISSIONS_BODY_ROWS,
  settings: missionsLayerSettings,
  visibility: missionsVisibility,
  sagas: [loadSpacecraftTracksSaga],
  exhibits: missionsLayerExhibits,
  create,
  destroy,
  passes: (runtime) => [missionTrailsPass(runtime)],
  guides: () => ({
    screenLabels: [
      {
        slab: NEAR0,
        id: 'missionCaptions',
        label: 'missions',
        produceLabels: produceMissionCaptions,
      },
    ],
  }),
  ui: [{ slot: 'labelsAndGuides', content: { toggle: 'missionTrails', label: 'Mission trails' } }],
});
