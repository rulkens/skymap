/** structureMarkersNearPass: the NEAR0-slab marker pass; see `createStructureMarkersPass`. */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { StructureRuntime } from '../@types/StructureRuntime';
import { createStructureMarkersPass } from '../render/createStructureMarkersPass';
import { structureMarkersPlanner } from '../frame';

export function structureMarkersNearPass(runtime: StructureRuntime): ContentPass<'structureRing'> {
  return createStructureMarkersPass({
    name: 'structure-markers-near',
    scale: 'milkyWay',
    renderer: runtime.nearRenderer,
    planner: structureMarkersPlanner(runtime),
  });
}
