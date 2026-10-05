/**
 * structureMarkersPlanner — decides, per view, which structure markers
 * (cluster / supercluster / void / group rings and halos) that view draws,
 * by running every marker producer against the view's own eye; the result
 * is the descriptor list `structureMarkersPass` uploads and draws. Per view
 * because sizing and culling depend on where THIS eye is: a dome face and
 * the canvas would keep different lists. Never votes awake or settling —
 * the list is a pure function of the pose, nothing in it animates.
 */

import type { FrameContentPlanner } from '../../../../@types/engine/frame/FrameContentPlanner';
import type { StructureMarkerDescriptor } from '../../../../@types/rendering/StructureMarkerDescriptor';
import { runMarkerProducers } from '../runMarkerProducers';

export const structureMarkersPlanner: FrameContentPlanner<readonly StructureMarkerDescriptor[]> = {
  name: 'structure-markers',
  scope: 'perView',
  plan: (view, state) => ({
    value: runMarkerProducers(state, view),
    awake: false,
    settling: false,
  }),
};
