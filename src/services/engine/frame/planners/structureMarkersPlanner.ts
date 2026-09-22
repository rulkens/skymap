/**
 * structureMarkersPlanner — the proving row: per-view because a face's markers
 * are sized and culled from ITS eye. Never awake/settling — the renderer's
 * instance buffer is upload-only content, not motion.
 */

import type { ContentPlanner } from '../../../../@types/engine/frame/ContentPlanner';
import type { StructureMarkerDescriptor } from '../../../../@types/rendering/StructureMarkerDescriptor';
import { runMarkerProducers } from '../runMarkerProducers';

export const structureMarkersPlanner: ContentPlanner<readonly StructureMarkerDescriptor[]> = {
  name: 'structure-markers',
  scope: 'perView',
  plan: (view, state) => ({
    value: runMarkerProducers(state, view),
    awake: false,
    settling: false,
  }),
};
