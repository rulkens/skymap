/**
 * structureMarkersPlanner — the proving row: per-view because a face's
 * markers are sized and culled from ITS eye, never awake/settling (the
 * renderer's instance buffer is upload-only content, not motion). Its `state`
 * is typed `PassState` by `ContentPlanner`'s contract, but `runMarkerProducers`
 * reads only fields `PassState` already carries plus a few core-only ones a
 * later task narrows; the cast is safe because `runPlanSteps` is only ever
 * called with the real `EngineState` (`renderFrame`'s one call site).
 */

import type { EngineState } from '../../../../@types/engine/state/EngineState';
import type { ContentPlanner } from '../../../../@types/engine/frame/ContentPlanner';
import type { StructureMarkerDescriptor } from '../../../../@types/rendering/StructureMarkerDescriptor';
import { runMarkerProducers } from '../runMarkerProducers';

export const structureMarkersPlanner: ContentPlanner<readonly StructureMarkerDescriptor[]> = {
  name: 'structure-markers',
  scope: 'perView',
  plan: (view, state) => ({
    value: runMarkerProducers(state as EngineState, view),
    awake: false,
    settling: false,
  }),
};
