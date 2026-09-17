/**
 * passes/index — CORE's half of the contributed-pass registry; `createLayers`
 * appends each Layer's own passes onto `state.passes`. It states no order —
 * `FRAME_ORDER` (`frameOrder.ts`) is the one artifact naming what draws, in what
 * order, into what, and carries the ordering rationale beside the line it explains.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { scalarVolumePass } from './scalarVolumePass';
import { flowFieldPass } from '../../../../layers/flow/passes/flowFieldPass';
import type { FlowRuntime } from '../../../../layers/flow/types/FlowRuntime';
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
import { markerLinesPass } from './markerLinesPass';
import { labelsPass } from './labelsPass';
import { clipPathDebugPass } from './clipPathDebugPass';
import { earthPass } from './earthPass';
import { surfaceTilesPass } from './surfaceTilesPass';
import { cloudShellPass } from './cloudShellPass';
import { starSpheresPass } from './starSpheresPass';
import { fieldStarSpherePass } from './fieldStarSpherePass';
import { planetsPass } from './planetsPass';
import { texturedBodiesPass } from './texturedBodiesPass';
import { meshBodiesPass } from './meshBodiesPass';
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
import { skyCubemapBlitPass } from './skyCubemapBlitPass';

/**
 * TEMPORARY: `flowFieldPass` now takes the flow Layer's own Runtime (05b Task
 * 4), which doesn't exist until the Layer forms (Task 5) — core still owns
 * this row until then. Rebuilds the Runtime shape from `state.gpu`/
 * `state.assetSlots` on every call (both non-null by the time a frame draws;
 * `initGpu`/`wireSlots` complete before the render loop starts) rather than
 * duplicating `flowFieldPass`'s body. Deleted along with this whole row in
 * Task 6.
 */
const flowFieldPassCore: ContentPass = {
  name: 'flow',
  enabled: (state, ctx, view) =>
    flowFieldPass({
      renderer: state.gpu.flowFieldRenderer,
      slot: state.assetSlots.flow,
    } as unknown as FlowRuntime).enabled(state, ctx, view),
  draw: (pass, view, ctx, state) =>
    flowFieldPass({
      renderer: state.gpu.flowFieldRenderer,
      slot: state.assetSlots.flow,
    } as unknown as FlowRuntime).draw(pass, view, ctx, state),
};

/**
 * Core's contributed passes, as a flat set. It states no order and no grouping:
 * `FRAME_ORDER` names each of these — and each Layer's — on the line that draws it.
 */
export const CONTENT_PASSES: readonly ContentPass[] = [
  scalarVolumePass,
  zoneOfAvoidancePass,
  flowFieldPassCore,
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
  markerLinesPass,
  labelsPass,
  earthPass,
  surfaceTilesPass,
  cloudShellPass,
  starSpheresPass,
  fieldStarSpherePass,
  planetsPass,
  texturedBodiesPass,
  meshBodiesPass,
  ringsPass,
  foregroundLabelsPass,
  clipPathDebugPass,
  atmosphereShellPass,
  skyCubemapBlitPass,
];
