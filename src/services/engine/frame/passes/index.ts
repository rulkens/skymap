/**
 * passes/index — CORE's half of the contributed-pass registry; `createLayers`
 * appends each Layer's own passes onto `state.passes`. It states no order —
 * `FRAME_ORDER` (`frameOrder.ts`) is the one artifact naming what draws, in what
 * order, into what, and carries the ordering rationale beside the line it explains.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { selectionRingPass } from './selectionRingPass';
import { near0SelectionRingPass } from './near0SelectionRingPass';
import { labelsPass } from './labelsPass';
import { clipPathDebugPass } from './clipPathDebugPass';
import { orbitTrailsPass } from './orbitTrailsPass';
import { labelsWorldPass } from './labelsWorldPass';
import { skyCubemapBlitPass } from './skyCubemapBlitPass';
import { domeResamplePass } from './domeResamplePass';
import { domeOcclusionResamplePass } from './domeOcclusionResamplePass';
import { occlusionMaskPass } from './occlusionMaskPass';
import { letterboxPass } from './letterboxPass';
import { COSMO, NEAR0 } from '../slabs';

/** Core's contributed passes, as a flat set; `FRAME_ORDER` orders them. */
export const CONTENT_PASSES: readonly ContentPass[] = [
  orbitTrailsPass,
  selectionRingPass,
  near0SelectionRingPass,
  labelsPass({
    name: 'labels-cosmo',
    slab: COSMO,
    renderer: 'labelRendererCosmo',
    pickRenderer: 'labelPickRendererCosmo',
  }),
  labelsPass({
    name: 'labels-near',
    slab: NEAR0,
    renderer: 'labelRendererNear',
    pickRenderer: 'labelPickRendererNear',
    // Ranks a caption over the body disc it draws on — `ContentPass.pickTarget`.
    pickTarget: 'overlay',
  }),
  labelsWorldPass,
  clipPathDebugPass,
  skyCubemapBlitPass,
  domeResamplePass,
  occlusionMaskPass,
  domeOcclusionResamplePass,
  letterboxPass,
];
