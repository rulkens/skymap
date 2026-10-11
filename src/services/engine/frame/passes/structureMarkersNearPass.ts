/** structureMarkersNearPass: the NEAR0-slab marker pass; see `createStructureMarkersPass`. */

import { createStructureMarkersPass } from './createStructureMarkersPass';

export const structureMarkersNearPass = createStructureMarkersPass({
  name: 'structure-markers-near',
  scale: 'milkyWay',
  rendererOf: (state) => state.gpu.structureMarkerNearRenderer,
});
