/**
 * passes/index — the contributed-pass registry: the flat list of every
 * `ContentPass` the renderer can draw. It states no order — `FRAME_ORDER`
 * (`frameOrder.ts`) is the one artifact naming what draws, in what order, into
 * what, and carries the ordering rationale beside the line it explains.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { scalarVolumePass } from './scalarVolumePass';
import { galaxyPointSpritesPass } from './galaxyPointSpritesPass';
import { proceduralDisksPass } from './proceduralDisksPass';
import { texturedDisksPass } from './texturedDisksPass';
import { filamentsPass } from './filamentsPass';
import { flowFieldPass } from './flowFieldPass';
import { volumeUpsamplePass } from './volumeUpsamplePass';
import { milkyWayPass } from './milkyWayPass';
import { milkyWayAggregatePass } from './milkyWayAggregatePass';
import { milkyWayUpsamplePass } from './milkyWayUpsamplePass';
import { horizonShellPass } from './horizonShellPass';
import { zoneOfAvoidancePass } from './zoneOfAvoidancePass';
import { zoneOfAvoidanceUpsamplePass } from './zoneOfAvoidanceUpsamplePass';
import { structureMarkersPass } from './structureMarkersPass';
import { selectionRingPass } from './selectionRingPass';
import { near0SelectionRingPass } from './near0SelectionRingPass';
import { diskRadiusRingPass } from './diskRadiusRingPass';
import { markerLinesPass } from './markerLinesPass';
import { labelsPass } from './labelsPass';
import { clipPathDebugPass } from './clipPathDebugPass';
import { earthPass } from './earthPass';
import { cloudShellPass } from './cloudShellPass';
import { starSpheresPass } from './starSpheresPass';
import { fieldStarSpherePass } from './fieldStarSpherePass';
import { planetsPass } from './planetsPass';
import { texturedBodiesPass } from './texturedBodiesPass';
import { ringsPass } from './ringsPass';
import { starPointsPass } from './starPointsPass';
import { bodyGlintsPass } from './bodyGlintsPass';
import { starCatalogPass } from './starCatalogPass';
import { starAggregatesPass } from './starAggregatesPass';
import { starAggregateUpsamplePass } from './starAggregateUpsamplePass';
import { constellationsPass } from './constellationsPass';
import { orbitTrailsPass } from './orbitTrailsPass';
import { foregroundLabelsPass } from './foregroundLabelsPass';
import { atmosphereShellPass } from './atmosphereShellPass';
import { sgrAStarLensingPass } from './sgrAStarLensingPass';

/**
 * The contributed passes, as a flat set. It states no order and no grouping:
 * `FRAME_ORDER` names each of these on the line that draws it.
 */
export const CONTENT_PASSES: readonly ContentPass[] = [
  scalarVolumePass,
  galaxyPointSpritesPass,
  zoneOfAvoidancePass,
  proceduralDisksPass,
  texturedDisksPass,
  filamentsPass,
  flowFieldPass,
  volumeUpsamplePass,
  zoneOfAvoidanceUpsamplePass,
  horizonShellPass,
  structureMarkersPass,
  milkyWayAggregatePass,
  milkyWayUpsamplePass,
  milkyWayPass,
  starPointsPass,
  starAggregatesPass,
  starCatalogPass,
  starAggregateUpsamplePass,
  constellationsPass,
  sgrAStarLensingPass,
  orbitTrailsPass,
  bodyGlintsPass,
  selectionRingPass,
  near0SelectionRingPass,
  diskRadiusRingPass,
  markerLinesPass,
  labelsPass,
  earthPass,
  cloudShellPass,
  starSpheresPass,
  fieldStarSpherePass,
  planetsPass,
  texturedBodiesPass,
  ringsPass,
  foregroundLabelsPass,
  clipPathDebugPass,
  atmosphereShellPass,
];

export { scalarVolumePass } from './scalarVolumePass';
export { galaxyPointSpritesPass } from './galaxyPointSpritesPass';
export { proceduralDisksPass } from './proceduralDisksPass';
export { texturedDisksPass } from './texturedDisksPass';
export { filamentsPass } from './filamentsPass';
export { flowFieldPass } from './flowFieldPass';
export { volumeUpsamplePass } from './volumeUpsamplePass';
export { milkyWayPass } from './milkyWayPass';
export { milkyWayAggregatePass } from './milkyWayAggregatePass';
export { milkyWayUpsamplePass } from './milkyWayUpsamplePass';
export { horizonShellPass } from './horizonShellPass';
export { zoneOfAvoidancePass } from './zoneOfAvoidancePass';
export { zoneOfAvoidanceUpsamplePass } from './zoneOfAvoidanceUpsamplePass';
export { structureMarkersPass } from './structureMarkersPass';
export { selectionRingPass } from './selectionRingPass';
export { near0SelectionRingPass } from './near0SelectionRingPass';
export { diskRadiusRingPass } from './diskRadiusRingPass';
export { markerLinesPass } from './markerLinesPass';
export { labelsPass } from './labelsPass';
export { clipPathDebugPass } from './clipPathDebugPass';
export { earthPass } from './earthPass';
export { cloudShellPass } from './cloudShellPass';
export { starSpheresPass } from './starSpheresPass';
export { fieldStarSpherePass } from './fieldStarSpherePass';
export { planetsPass } from './planetsPass';
export { texturedBodiesPass } from './texturedBodiesPass';
export { ringsPass } from './ringsPass';
export { starPointsPass } from './starPointsPass';
export { bodyGlintsPass } from './bodyGlintsPass';
export { sgrAStarLensingPass } from './sgrAStarLensingPass';
export { starCatalogPass } from './starCatalogPass';
export { starAggregatesPass } from './starAggregatesPass';
export { starAggregateUpsamplePass } from './starAggregateUpsamplePass';
export { constellationsPass } from './constellationsPass';
export { orbitTrailsPass } from './orbitTrailsPass';
export { foregroundLabelsPass } from './foregroundLabelsPass';
export { atmosphereShellPass } from './atmosphereShellPass';
