/**
 * structureMarkersPlanner — decides, per view, which structure markers
 * (the cosmic and Milky Way rings and halos) that view draws, by running
 * `produceStructureMarkers` against the view's own eye; the result is the
 * descriptor list both marker passes upload and draw. Per view because sizing
 * and culling depend on where THIS eye is: a dome face and the canvas would
 * keep different lists. Never votes awake or settling — the list is a pure
 * function of the pose, nothing in it animates. The list is handed on in
 * `store.all()` order, never sorted, filtered or deduped: ring pick indices
 * depend on it (`produceStructureMarkers`' header holds the contract).
 */

import type { FrameContentPlanner } from '../../@types/engine/frame/FrameContentPlanner';
import type { StructureMarkerDescriptor } from '../../@types/rendering/StructureMarkerDescriptor';
import { produceStructureMarkers } from './present/produceStructureMarkers';

export const structureMarkersPlanner: FrameContentPlanner<readonly StructureMarkerDescriptor[]> = {
  name: 'structure-markers',
  scope: 'perView',
  plan: (view, state) => ({
    value: produceStructureMarkers(state, view),
    awake: false,
    settling: false,
  }),
};
