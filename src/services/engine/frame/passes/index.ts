/**
 * passes/index — CORE's half of the contributed-pass registry; `createLayers`
 * appends each Layer's own passes onto `state.passes`. It states no order —
 * `FRAME_ORDER` (`frameOrder.ts`) is the one artifact naming what draws, in what
 * order, into what, and carries the ordering rationale beside the line it explains.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { horizonShellPass } from './horizonShellPass';
import { selectionRingPass } from './selectionRingPass';
import { near0SelectionRingPass } from './near0SelectionRingPass';
import { markerLinesPass } from './markerLinesPass';
import { labelsCosmoPass } from './labelsCosmoPass';
import { clipPathDebugPass } from './clipPathDebugPass';
import { earthPass } from '../../../../layers/body/passes/earthPass';
import { surfaceTilesPass } from '../../../../layers/body/passes/surfaceTilesPass';
import { terrainPickMarkerPass } from '../../../../layers/body/passes/terrainPickMarkerPass';
import { cloudShellPass } from '../../../../layers/body/passes/cloudShellPass';
import { planetsPass } from '../../../../layers/body/passes/planetsPass';
import { texturedBodiesPass } from '../../../../layers/body/passes/texturedBodiesPass';
import { coreMeshBodiesPass } from '../../../../layers/body/passes/coreMeshBodiesPass';
import { ringsPass } from '../../../../layers/body/passes/ringsPass';
import { bodyGlintsPass } from '../../../../layers/body/passes/bodyGlintsPass';
import { orbitTrailsPass } from './orbitTrailsPass';
import { labelsNearPass } from './labelsNearPass';
import { atmosphereShellPass } from '../../../../layers/body/passes/atmosphereShellPass';
import { aerialPerspectivePass } from '../../../../layers/body/passes/aerialPerspectivePass';
import { skyCubemapBlitPass } from './skyCubemapBlitPass';
import { domeResamplePass } from './domeResamplePass';

/**
 * Core's contributed passes, as a flat set. It states no order and no grouping:
 * `FRAME_ORDER` names each of these — and each Layer's — on the line that draws it.
 */
export const CONTENT_PASSES: readonly ContentPass[] = [
  horizonShellPass,
  orbitTrailsPass,
  bodyGlintsPass,
  selectionRingPass,
  near0SelectionRingPass,
  markerLinesPass,
  labelsCosmoPass,
  earthPass,
  surfaceTilesPass,
  terrainPickMarkerPass,
  cloudShellPass,
  planetsPass,
  texturedBodiesPass,
  coreMeshBodiesPass,
  ringsPass,
  labelsNearPass,
  clipPathDebugPass,
  atmosphereShellPass,
  aerialPerspectivePass,
  skyCubemapBlitPass,
  domeResamplePass,
];
