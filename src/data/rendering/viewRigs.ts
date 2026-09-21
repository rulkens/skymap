/**
 * VIEW_RIGS — every `ViewRigKey`'s roster. `mono` is today's frame: one view,
 * identically the main context, over the four sections in their authored
 * order.
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
  // own. No `OVERLAYS` — a dome has no single cursor ray for a caption to clip
  // against, which is also why picking is off.
  dome: {
    views: domeFaceSpecs,
    program: [PRELUDE, SCENE_TO_DOME_CUBE, DOME_RESAMPLE, POST],
    pickable: false,
  },
};
