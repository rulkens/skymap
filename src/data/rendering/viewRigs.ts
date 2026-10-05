/**
 * VIEW_RIGS — every `ViewRigKey`'s roster. `mono` is one view, identically
 * the main context, over the four sections in their authored order. `dome`
 * is five views, one per cube face, resampled into the same canvas `mono`
 * draws to.
 */

import type { ViewRig } from '../../@types/engine/frame/ViewRig';
import type { ViewRigKey } from '../../@types/engine/frame/ViewRigKey';
import { domeFaceSpecs } from '../../utils/camera/domeFaceSpecs';
import { DOME_RESAMPLE, OVERLAYS, POST, PRELUDE, SCENE, SCENE_TO_DOME_CUBE } from './frameSections';

export const VIEW_RIGS: Readonly<Record<ViewRigKey, ViewRig>> = {
  mono: {
    // `null`, never `[mainViewSpec(...)]` — see `ViewRig.views`'s doc.
    views: () => null,
    program: [PRELUDE, SCENE, POST, OVERLAYS],
    pickable: true,
  },
  // Five dome-cube faces, no canvas draw of its own: the resample step reads
  // them back into `hdr`, which `POST` composites to the canvas like mono's
  // own. No `OVERLAYS` — see `docs/backlog/2026-09-23-dome-output-space-overlays.md`
  // for why labels are off and what wiring restoring them needs.
  dome: {
    views: domeFaceSpecs,
    program: [PRELUDE, SCENE_TO_DOME_CUBE, DOME_RESAMPLE, POST],
    pickable: false,
  },
};
