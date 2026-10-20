/**
 * structureMarkersPlanner — decides, per view, which structure markers
 * (the cosmic and Milky Way rings and halos) that view draws, by running
 * `produceStructureMarkers` against the view's own eye; the result is the
 * descriptor list both marker passes upload and draw. Per view because sizing
 * and culling depend on where THIS eye is: a dome face and the canvas would
 * keep different lists. The list is handed on in
 * `store.all()` order, never sorted, filtered or deduped: ring pick indices
 * depend on it (`produceStructureMarkers`' header holds the contract).
 */

import type { FrameContentPlanner } from '../../@types/engine/frame/FrameContentPlanner';
import type { StructureMarkerDescriptor } from './@types/StructureMarkerDescriptor';
import type { StructureRuntime } from './@types/StructureRuntime';
import { produceStructureMarkers } from './present/produceStructureMarkers';

export function structureMarkersPlanner(
  runtime: Pick<StructureRuntime, 'store'>,
): Extract<
  FrameContentPlanner<readonly StructureMarkerDescriptor[], 'structureRing'>,
  { scope: 'perView' }
> {
  return {
    name: 'structure-markers',
    scope: 'perView',
    fade: 'structureRing',
    plan: (view, state, fade) => ({
      value: produceStructureMarkers(runtime.store, state, view, fade),
      awake: false,
      settling: false,
    }),
  };
}
