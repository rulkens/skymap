/**
 * passes/index — CORE's half of the contributed-pass registry; `createLayers`
 * appends each Layer's own passes onto `state.passes`. It states no order —
 * `FRAME_ORDER` (`frameOrder.ts`) is the one artifact naming what draws, in what
 * order, into what, and carries the ordering rationale beside the line it explains.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { selectionRingPass } from './selectionRingPass';
import { near0SelectionRingPass } from './near0SelectionRingPass';
import { markerLinesPass } from './markerLinesPass';
import { labelsCosmoPass } from './labelsCosmoPass';
import { clipPathDebugPass } from './clipPathDebugPass';
import { orbitTrailsPass } from './orbitTrailsPass';
import { labelsNearPass } from './labelsNearPass';
import { skyCubemapBlitPass } from './skyCubemapBlitPass';
import { domeResamplePass } from './domeResamplePass';

/** Core's contributed passes, as a flat set; `FRAME_ORDER` orders them. */
export const CONTENT_PASSES: readonly ContentPass[] = [
  orbitTrailsPass,
  selectionRingPass,
  near0SelectionRingPass,
  markerLinesPass,
  labelsCosmoPass,
  labelsNearPass,
  clipPathDebugPass,
  skyCubemapBlitPass,
  domeResamplePass,
];
